import "server-only";
import type { NextRequest } from "next/server";
import axios from "axios";
import config from "./config";
import { getAggregatorSenderApiKey } from "./server-config";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "./server-analytics";
import { isInjectedUserId } from "./injected-identity";
import { collectLinkedWalletAddressesForChainType } from "./privy";
import { createOrderOwnerReference } from "./transaction-wallet-auth";
import { executeSwapTransactionLimitCheck } from "./swap-transaction-limit-server";
import { monthlyLimitReachedMessage } from "./kyc-limit-copy";
import {
  kesRecipientMetadata,
  parseMessageHashBody,
  type MessageHashApiResult,
  type MessageHashInput,
  type MessageHashRequest,
} from "./payment-order-message-hash";
import { fetchTokens } from "../api/aggregator";
import { isApiOfframpNetwork, normalizeNetworkName } from "../utils";

/**
 * Sells created through the aggregator sender API (POST /v2/sender/orders with
 * a crypto source) instead of an on-chain Gateway call. The aggregator returns
 * a deposit address and the user's wallet makes a plain transfer to it; on a
 * bridged network (Solana, Tron) that is the only way to reach the aggregator.
 *
 * The order body is built here, never proxied: the client supplies only what it
 * legitimately knows (amount, rate, recipient, its own refund address), so fee
 * fields, the fee payer and provider queues cannot be set from the browser.
 *
 * Handler follows payment-order-message-hash.ts: a minimal request surface in,
 * `{ status, body }` out, so it is unit-testable without NextRequest.
 */

export const PAYMENT_ORDERS_ENDPOINT = "/api/v1/payment-orders";

const DECIMAL_RE = /^\d{1,30}(\.\d{1,18})?$/;
const TOKEN_RE = /^[A-Za-z0-9]{2,12}$/;
const FIAT_RE = /^[A-Z]{3}$/;
const STARKNET_ADDRESS_RE = /^0x[0-9a-fA-F]{1,64}$/;
const TRON_ADDRESS_RE = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Privy `chainType` of the wallet that deposits (and is refunded) on a network. */
type WalletFamily = "starknet" | "tron" | "solana";

const WALLET_FAMILY_BY_NETWORK: Record<string, WalletFamily> = {
  Starknet: "starknet",
  Tron: "tron",
  Solana: "solana",
};

export type OfframpOrderInput = {
  /** Noblocks network display name, e.g. "Starknet". */
  network: string;
  token: string;
  amount: string;
  rate: string;
  currency: string;
  refundAddress: string;
  recipient: MessageHashInput;
};

export type ParseOfframpOrderResult =
  | { ok: true; input: OfframpOrderInput }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPositiveDecimal(value: string): boolean {
  return DECIMAL_RE.test(value) && Number(value) > 0;
}

/**
 * Allowlist parser. Reads only the fields named here; `senderFee`,
 * `senderFeePercent`, `senderFeeAddress`, `transactionFeePayer`, `reference`,
 * `providerIds` or anything else in the body is ignored by construction.
 */
export function parseOfframpOrderBody(raw: unknown): ParseOfframpOrderResult {
  const body = asRecord(raw);
  const source = asRecord(body?.source);
  const destination = asRecord(body?.destination);
  if (!body || !source || !destination) {
    return { ok: false, error: "Request body must include source and destination" };
  }

  const amount = trimmedString(body.amount);
  if (!isPositiveDecimal(amount)) {
    return { ok: false, error: "amount must be a positive decimal string" };
  }
  const rate = trimmedString(body.rate);
  if (!isPositiveDecimal(rate)) {
    return { ok: false, error: "rate must be a positive decimal string" };
  }

  const network = trimmedString(source.network);
  if (!network || network.length > 32) {
    return { ok: false, error: "source.network is required" };
  }
  const token = trimmedString(source.currency);
  if (!TOKEN_RE.test(token)) {
    return { ok: false, error: "source.currency is not a valid token symbol" };
  }
  const refundAddress = trimmedString(source.refundAddress);
  if (!refundAddress || refundAddress.length > 128) {
    return { ok: false, error: "source.refundAddress is required" };
  }

  const currency = trimmedString(destination.currency).toUpperCase();
  if (!FIAT_RE.test(currency)) {
    return { ok: false, error: "destination.currency is not a valid currency code" };
  }

  // Same recipient rules as the on-chain path; providerId rides alongside the
  // recipient there, so fold it in before parsing.
  const recipient = parseMessageHashBody({
    ...(asRecord(destination.recipient) ?? {}),
    providerId: destination.providerId,
  });
  if (!recipient.ok) return { ok: false, error: recipient.error };

  return {
    ok: true,
    input: {
      network,
      token,
      amount,
      rate,
      currency,
      refundAddress,
      recipient: recipient.input,
    },
  };
}

/**
 * Canonical form of an address for its wallet family, or null when it is not a
 * valid address there. Starknet is padded to 0x + 64 hex: the aggregator
 * rejects short forms, and Privy and the client may each hold either.
 */
export function normalizeWalletAddress(
  family: WalletFamily,
  address: string,
): string | null {
  const trimmed = address.trim();
  if (family === "starknet") {
    if (!STARKNET_ADDRESS_RE.test(trimmed)) return null;
    const hex = trimmed.slice(2).toLowerCase().padStart(64, "0");
    return /^0+$/.test(hex) ? null : `0x${hex}`;
  }
  if (family === "tron") return TRON_ADDRESS_RE.test(trimmed) ? trimmed : null;
  return SOLANA_ADDRESS_RE.test(trimmed) ? trimmed : null;
}

/** The complete POST /v2/sender/orders body for a sell. Nothing else is ever sent. */
export function buildSenderOfframpOrderBody(
  input: OfframpOrderInput,
  resolved: { aggregatorNetwork: string; refundAddress: string; reference: string },
) {
  const { recipient } = input;
  const metadata = kesRecipientMetadata(recipient);

  return {
    amount: input.amount,
    amountIn: "crypto" as const,
    rate: input.rate,
    reference: resolved.reference,
    source: {
      type: "crypto" as const,
      currency: input.token,
      network: resolved.aggregatorNetwork,
      refundAddress: resolved.refundAddress,
    },
    destination: {
      type: "fiat" as const,
      currency: input.currency,
      ...(recipient.providerId ? { providerId: recipient.providerId } : {}),
      recipient: {
        institution: recipient.institution,
        accountIdentifier: recipient.accountIdentifier,
        accountName: recipient.accountName,
        memo: recipient.memo ?? "",
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      },
    },
  };
}

/**
 * POST /v2/sender/orders with the sender API key. Shared by the on-ramp branch
 * of the route and the sell handler below.
 */
export async function postSenderOrder(
  body: unknown,
  apiKey: string,
): Promise<{ status: number; data: unknown }> {
  const baseUrl = config.aggregatorUrl.replace(/\/+$/, "").replace(/\/v1$/i, "");
  const { data, status } = await axios.post(`${baseUrl}/v2/sender/orders`, body, {
    headers: {
      "Content-Type": "application/json",
      "API-Key": apiKey,
    },
    validateStatus: () => true,
  });

  // Aggregator returns 404 for unknown API keys; use 401 so clients don't treat it as "route not found".
  const message =
    data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string"
      ? (data as { message: string }).message
      : "";
  if (status === 404 && /api key not found/i.test(message)) {
    return { status: 401, data };
  }
  return { status, data };
}

function errorBody(message: string): Record<string, unknown> {
  return { status: "error", message };
}

export async function handleCreateOfframpOrder(
  request: MessageHashRequest,
  rawBody: unknown,
): Promise<MessageHashApiResult> {
  const startTime = Date.now();
  const req = request as unknown as NextRequest;
  const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

  const fail = (status: number, message: string, cause: string = message) => {
    trackApiError(req, PAYMENT_ORDERS_ENDPOINT, "POST", new Error(cause), status);
    return { status, body: errorBody(message) };
  };

  if (!walletAddress) return fail(401, "Unauthorized");

  trackApiRequest(req, PAYMENT_ORDERS_ENDPOINT, "POST", {
    wallet_address: walletAddress,
    order_type: "offramp",
  });

  try {
    const apiKey = getAggregatorSenderApiKey();
    if (!apiKey || !config.aggregatorUrl) {
      // Env names stay server-side; the client only sees a generic 503.
      const cause = !apiKey
        ? "AGGREGATOR_SENDER_API_KEY_ID is not configured"
        : "NEXT_PUBLIC_AGGREGATOR_URL is not configured";
      console.error(`[payment-orders] ${cause}`);
      return fail(503, "Order service temporarily unavailable", cause);
    }

    const parsed = parseOfframpOrderBody(rawBody);
    if (!parsed.ok) return fail(400, parsed.error);
    const input = parsed.input;

    // Everything else is created on-chain by the user's wallet. Refusing here
    // keeps a network from silently switching paths.
    const family = WALLET_FAMILY_BY_NETWORK[input.network];
    if (!family || !isApiOfframpNetwork({ name: input.network })) {
      return fail(400, `Sells on ${input.network} are not created through this endpoint`);
    }

    const refundAddress = normalizeWalletAddress(family, input.refundAddress);
    if (!refundAddress) {
      return fail(400, `Refund address is not a valid ${input.network} address`);
    }

    // Refunds, and the deposit itself, belong to the caller's own wallet on
    // this network. Injected (SIWE) sessions have no Privy user to check.
    const userId = request.headers.get("x-user-id");
    if (!userId || isInjectedUserId(userId)) {
      return fail(403, `Selling on ${input.network} needs your Noblocks wallet`);
    }
    let linkedAddresses: string[];
    try {
      linkedAddresses = await collectLinkedWalletAddressesForChainType(userId, family);
    } catch (error) {
      console.error("[payment-orders] Privy wallet lookup failed:", error);
      return fail(503, "Unable to verify wallet ownership. Please try again.");
    }
    const ownsRefundAddress = linkedAddresses.some(
      (linked) => normalizeWalletAddress(family, linked) === refundAddress,
    );
    if (!ownsRefundAddress) {
      return fail(403, `Refund address must be your own ${input.network} wallet`);
    }

    // The aggregator matches the network id exactly, so take it from its own
    // token list rather than deriving it from the display name.
    let aggregatorNetwork: string | undefined;
    let tokenDecimals = 0;
    try {
      const match = (await fetchTokens()).find(
        (t) =>
          t.symbol.toUpperCase() === input.token.toUpperCase() &&
          normalizeNetworkName(t.network) === input.network,
      );
      aggregatorNetwork = match?.network;
      tokenDecimals = match?.decimals ?? 0;
    } catch (error) {
      console.error("[payment-orders] token list fetch failed:", error);
      return fail(502, "Could not reach the aggregator. Please try again.");
    }
    if (!aggregatorNetwork) {
      return fail(400, `${input.token} is not available on ${input.network} right now`);
    }
    if ((input.amount.split(".")[1]?.length ?? 0) > tokenDecimals) {
      return fail(400, `amount has more than ${tokenDecimals} decimal places`);
    }

    // Noblocks is the party creating this order, so the monthly limit is
    // enforced here and not only by the client's precheck.
    const limit = await executeSwapTransactionLimitCheck(
      walletAddress,
      {
        transactionType: "offramp",
        fromCurrency: input.token,
        toCurrency: input.currency,
        amountSent: Number(input.amount),
        amountReceived: Number((Number(input.amount) * Number(input.rate)).toFixed(2)),
        fee: Number(input.rate),
        recipient: {
          account_name: input.recipient.accountName,
          institution: input.recipient.institution,
          account_identifier: input.recipient.accountIdentifier,
        },
        status: "pending",
      },
      { dryRun: true, explorerLink: null, normalizedEmail: null },
    );
    if (limit.kind === "kyc_required") {
      return fail(403, "Identity verification required to make transactions.");
    }
    if (limit.kind === "limit_exceeded") {
      return fail(
        403,
        monthlyLimitReachedMessage(limit.monthlyLimit, limit.pooledWalletCount),
        "Monthly KYC limit exceeded",
      );
    }
    if (limit.kind === "rate_unavailable") {
      return fail(503, "Unable to verify transaction amount. Please try again.");
    }
    if (limit.kind !== "success") {
      return fail(503, "Unable to verify transaction limits. Please try again.", limit.kind);
    }

    const orderBody = buildSenderOfframpOrderBody(input, {
      aggregatorNetwork,
      refundAddress,
      // Binds the order to its creator before the client learns its id; order reads
      // authorize against this, not against a client-written transaction row.
      reference: createOrderOwnerReference(userId),
    });

    let result: { status: number; data: unknown };
    try {
      result = await postSenderOrder(orderBody, apiKey);
    } catch (error) {
      console.error("[payment-orders] sender order request failed:", error);
      return fail(502, "Could not reach the aggregator. Please try again.");
    }

    trackApiResponse(PAYMENT_ORDERS_ENDPOINT, "POST", result.status, Date.now() - startTime, {
      wallet_address: walletAddress,
      order_type: "offramp",
      network: input.network,
    });
    return {
      status: result.status,
      body: (asRecord(result.data) ?? errorBody("Unexpected aggregator response")),
    };
  } catch (error) {
    console.error("[payment-orders] unexpected error creating sell order:", error);
    trackApiError(
      req,
      PAYMENT_ORDERS_ENDPOINT,
      "POST",
      error instanceof Error ? error : new Error(String(error)),
      500,
      { response_time_ms: Date.now() - startTime },
    );
    return { status: 500, body: errorBody("Internal server error") };
  }
}
