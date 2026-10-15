import { NextRequest } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import config from "@/app/lib/config";
import { getAggregatorSenderApiKey } from "@/app/lib/server-config";
import { getKycFullName } from "@/app/lib/kyc-profile-server";
import { isOnrampFiatCurrencyCode, normalizeNetworkName } from "@/app/utils";
import {
  accountNameMatchesKyc,
  REFUND_NAME_MISMATCH_MESSAGE,
} from "@/app/lib/name-matching";
import {
  handleCreateOfframpOrder,
  postSenderOrder,
} from "@/app/lib/payment-order-offramp";
import {
  parseSenderOrderRecord,
  precheckSenderOrderRow,
  recordSenderOrderRow,
  type SenderOrderRow,
} from "@/app/lib/swap-transaction-limit-server";
import {
  paymentOrdersJson,
  tracePaymentOrdersProxy,
} from "@/app/lib/payment-orders-tracing";

export const POST = withRateLimit(async (request: NextRequest) =>
  tracePaymentOrdersProxy("create", {}, async (span) => {
  const startTime = Date.now();

  try {
    const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

    if (!walletAddress) {
      trackApiError(request, "/api/v1/payment-orders", "POST", new Error("Unauthorized"), 401);
      return paymentOrdersJson(span, { success: false, error: "Unauthorized" }, 401);
    }

    const body = await request.json();

    // Sells on sender-API networks (crypto source). The handler owns its own
    // validation, limits and tracking; everything below is on-ramp only.
    if ((body as { source?: { type?: unknown } })?.source?.type === "crypto") {
      const result = await handleCreateOfframpOrder(request, body);
      span?.setTag("order_type", "offramp");
      return paymentOrdersJson(span, result.body, result.status);
    }

    trackApiRequest(request, "/api/v1/payment-orders", "POST", { wallet_address: walletAddress });

    if (!config.aggregatorUrl) {
      trackApiError(request, "/api/v1/payment-orders", "POST", new Error("NEXT_PUBLIC_AGGREGATOR_URL is not configured"), 500);
      return paymentOrdersJson(
        span,
        { success: false, error: "NEXT_PUBLIC_AGGREGATOR_URL is not configured" },
        500,
      );
    }

    const senderApiKey = getAggregatorSenderApiKey();
    if (!senderApiKey) {
      trackApiError(
        request,
        "/api/v1/payment-orders",
        "POST",
        new Error("AGGREGATOR_SENDER_API_KEY_ID is not configured"),
        500,
      );
      return paymentOrdersJson(
        span,
        { success: false, error: "AGGREGATOR_SENDER_API_KEY_ID is not configured" },
        500,
      );
    }

    // On-ramp (fiat source) from here on.
    const source = (
      body as {
        source?: {
          type?: string;
          refundAccount?: { accountName?: unknown };
        };
      }
    )?.source;
    const sourceType = source?.type;
    if (sourceType !== "fiat") {
      trackApiError(
        request,
        "/api/v1/payment-orders",
        "POST",
        new Error("Unsupported payment order source type"),
        400,
      );
      return paymentOrdersJson(
        span,
        {
          success: false,
          error: "Payment order source must be fiat (on-ramp) or crypto (off-ramp).",
        },
        400,
      );
    }

    const sourceCurrencyRaw =
      typeof (source as { currency?: unknown })?.currency === "string"
        ? (source as { currency: string }).currency.trim()
        : "";
    const sourceCurrency = sourceCurrencyRaw.toUpperCase();
    if (!sourceCurrency || !isOnrampFiatCurrencyCode(sourceCurrency)) {
      trackApiError(
        request,
        "/api/v1/payment-orders",
        "POST",
        new Error(`On-ramp not supported for fiat currency: ${sourceCurrencyRaw || "missing"}`),
        400,
      );
      return paymentOrdersJson(
        span,
        {
          success: false,
          error: sourceCurrencyRaw
            ? `${sourceCurrencyRaw} on-ramp is not available.`
            : "On-ramp order is missing source currency.",
        },
        400,
      );
    }

    (body as { source?: { currency?: string } }).source!.currency = sourceCurrency;
    span?.setTag("source_currency", sourceCurrency);

    // Refund-account name policy (authoritative gate at money time). The refund account must belong
    // to the same person as the verified KYC profile. A modified client must not be able to bypass
    // this by omitting the account name, so an onramp refund account without a RESOLVED name is
    // rejected outright rather than proxied unvalidated.
    const refundAccount = source?.refundAccount;
    const refundAccountName =
      typeof refundAccount?.accountName === "string"
        ? refundAccount.accountName.trim()
        : "";
    if (!refundAccount || !refundAccountName) {
      trackApiError(
        request,
        "/api/v1/payment-orders",
        "POST",
        new Error("Onramp order is missing a resolved refund account name"),
        422,
      );
      return paymentOrdersJson(
        span,
        {
          success: false,
          error:
            "A verified refund account is required. Please add one and try again.",
        },
        422,
      );
    }
    // KYC is required to onramp, so the name is present; if a lookup fails, fail closed rather than
    // proxy an unvalidated refund destination.
    const kyc = await getKycFullName(walletAddress);
    if (!kyc.ok) {
      trackApiError(
        request,
        "/api/v1/payment-orders",
        "POST",
        new Error("KYC name lookup failed"),
        503,
      );
      return paymentOrdersJson(
        span,
        {
          success: false,
          error: "Could not verify your identity right now. Please try again.",
        },
        503,
      );
    }
    // Fail closed: reject order if KYC name is missing (null/empty). Without a verified name on file,
    // we cannot validate the refund account belongs to the user.
    if (!kyc.fullName) {
      trackApiError(
        request,
        "/api/v1/payment-orders",
        "POST",
        new Error("KYC profile is missing verified full name"),
        422,
      );
      return paymentOrdersJson(
        span,
        {
          success: false,
          error: "Your identity verification is incomplete. Please complete KYC with your full name.",
        },
        422,
      );
    }
    // Validate the refund account name matches the verified KYC name.
    if (!accountNameMatchesKyc(kyc.fullName, refundAccountName)) {
      trackApiError(
        request,
        "/api/v1/payment-orders",
        "POST",
        new Error("Refund account name does not match KYC profile"),
        422,
      );
      return paymentOrdersJson(
        span,
        { success: false, error: REFUND_NAME_MISMATCH_MESSAGE },
        422,
      );
    }

    // The transaction row is recorded here, not by the client: only the server writes
    // rows for sender orders, which is what lets order reads trust them. Limits are
    // checked before the order exists and enforced again atomically by the insert.
    const { record: rawRecord, ...orderBody } = body as Record<string, unknown>;
    const record = await parseSenderOrderRecord(request, walletAddress, rawRecord);
    if (!record.ok) {
      trackApiError(request, "/api/v1/payment-orders", "POST", new Error(record.error), record.status);
      return paymentOrdersJson(span, { success: false, error: record.error }, record.status);
    }
    const destination = (orderBody.destination ?? {}) as { currency?: unknown; network?: unknown };
    const row: SenderOrderRow = {
      transactionType: "onramp",
      fromCurrency: sourceCurrency,
      toCurrency: String(destination.currency ?? ""),
      amountSent: Number(orderBody.amount),
      amountReceived: record.record.amountReceived,
      fee: 0,
      recipient: record.record.recipient,
      network: normalizeNetworkName(String(destination.network ?? "")),
    };
    const precheck = await precheckSenderOrderRow(record.record, row);
    if (!precheck.ok) {
      trackApiError(request, "/api/v1/payment-orders", "POST", new Error(precheck.error), precheck.status);
      return paymentOrdersJson(span, { success: false, error: precheck.error }, precheck.status);
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[payment-orders] POST payload →", JSON.stringify(orderBody, null, 2));
    }

    // Forwards X-Request-ID and trace context, and maps the unknown-API-key 404 to 401.
    const { data, status } = await postSenderOrder(orderBody, senderApiKey, request.headers);

    if (process.env.NODE_ENV === "development" && status >= 400) {
      console.log("[payment-orders] aggregator response →", status, JSON.stringify(data, null, 2));
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/v1/payment-orders", "POST", status, responseTime, {
      wallet_address: walletAddress,
    });

    const created = (data as { data?: { id?: unknown; rate?: unknown; providerAccount?: unknown } } | null)?.data;
    if (status < 200 || status >= 300 || typeof created?.id !== "string") {
      return paymentOrdersJson(span, data, status);
    }

    // The order exists but is unrecorded if this fails: it is never shown or paid,
    // and expires on its own.
    const recorded = await recordSenderOrderRow(
      record.record,
      { ...row, fee: Number(created.rate) || 0 },
      created.id,
      created.providerAccount,
    );
    if (!recorded.ok) {
      console.error(`[payment-orders] onramp order ${created.id} created but not recorded: ${recorded.error}`);
      trackApiError(request, "/api/v1/payment-orders", "POST", new Error(recorded.error), recorded.status);
      return paymentOrdersJson(span, { success: false, error: recorded.error }, recorded.status);
    }

    return paymentOrdersJson(
      span,
      { ...(data as Record<string, unknown>), transactionId: recorded.id },
      status,
    );
  } catch (error) {
    console.error("Error creating payment order:", error);

    const responseTime = Date.now() - startTime;
    trackApiError(request, "/api/v1/payment-orders", "POST", error as Error, 500, {
      response_time_ms: responseTime,
    });

    return paymentOrdersJson(
      span,
      { success: false, error: "Internal server error" },
      500,
    );
  }
  }),
);
