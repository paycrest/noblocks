import axios from "axios";
import type {
  RatePayload,
  RateResponse,
  RateSide,
  V2RateQuoteResponse,
  V2MarketOffer,
  MarketsPayload,
  InstitutionProps,
  PubkeyResponse,
  VerifyAccountPayload,
  InitiateKYCPayload,
  InitiateKYCResponse,
  SmileIDSubmissionResponse,
  KYCStatusResponse,
  OrderDetailsResponse,
  OrderDetailsData,
  TransactionStatus,
  TransactionResponse,
  TransactionCreateInput,
  SaveTransactionResponse,
  UpdateTransactionDetailsPayload,
  UpdateTransactionStatusPayload,
  APIToken,
  RecipientDetails,
  RecipientDetailsWithId,
  SavedRecipientsResponse,
  V2CreatePaymentOrderPayload,
  V2PaymentOrderCreateData,
  V2PaymentOrderGetData,
  AggregatorEnvelope,
  RefundAccountDetails,
  ReferralData,
  ApiResponse,
  SubmitReferralResult,
  KesMpesaChannel,
} from "../types";
import {
  trackServerEvent,
  trackBusinessEvent,
  trackApiRequest,
  trackApiResponse,
} from "../lib/server-analytics";
import config from "../lib/config";
import { getAggregatorSenderApiKey } from "../lib/server-config";
import {
  isGatewayOrderId,
  isStarknetOrderId,
  resolveChainIdFromNetworkName,
} from "../lib/payment-order-id";
import { isNoProviderError } from "../lib/errorMessages";

const AGGREGATOR_URL = config.aggregatorUrl;

/** Maps aggregator order status → Supabase `transactions.status`. Swap keeps validated→completed; on-ramp keeps pending until settled. */
export function mapAggregatorStatusToDbStatus(
  status: string,
  opts?: { onramp?: boolean },
): TransactionStatus {
  const s = String(status || "").toLowerCase();
  const onramp = opts?.onramp === true;
  if (s === "settled") return "completed";
  if (s === "refunded") return "refunded";
  if (s === "refunding") return "refunding";
  if (s === "fulfilled") return "fulfilled";
  if (s === "expired") return "expired";
  if (s === "validated") return onramp ? "pending" : "completed";
  if (["settling", "fulfilling", "pending"].includes(s)) return "pending";
  return "pending";
}

/**
 * On-ramp: aggregator may still return `pending` after the VA window; if `validUntil` is in the past
 * and no later status arrived, treat as expired (matches product expectation for unfunded orders).
 */
export function resolveOnrampOrderStatusFromV2Response(
  res: AggregatorEnvelope<V2PaymentOrderGetData>,
): string | undefined {
  const data = res?.data;
  if (!data || typeof data !== "object") return undefined;
  const status = String(data.status ?? "");
  const s = status.toLowerCase();
  if (s !== "pending") return status;
  const validUntil = data.providerAccount?.validUntil;
  if (!validUntil) return status;
  const end = new Date(validUntil).getTime();
  if (Number.isNaN(end) || Date.now() <= end) return status;
  return "expired";
}

export function unwrapV2SenderOrderEnvelope(
  raw: unknown,
): OrderDetailsData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === "object" && inner !== null) {
    return inner as OrderDetailsData;
  }
  return o as unknown as OrderDetailsData;
}

function mapTransactionLogStatusToReceiptStatus(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase();
  if (s === "order_created") return "pending";
  if (s.startsWith("order_")) return s.slice(6);
  return s;
}

/** Maps GET /v2/sender/orders/:id `data` into legacy `OrderDetailsData` used by reconciliation / status UI. */
export function mapV2SenderOrderGetToOrderDetailsData(
  data: unknown,
): OrderDetailsData | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.status !== "string") return null;

  const logsRaw = d.transactionLogs;
  const txReceipts: OrderDetailsData["txReceipts"] = [];
  if (Array.isArray(logsRaw)) {
    for (const log of logsRaw) {
      if (!log || typeof log !== "object") continue;
      const L = log as Record<string, unknown>;
      const txHash = String(L.tx_hash ?? L.txHash ?? "");
      const created = L.created_at ?? L.createdAt;
      const timestamp =
        typeof created === "string"
          ? created
          : created instanceof Date
            ? created.toISOString()
            : "";
      txReceipts.push({
        status: mapTransactionLogStatusToReceiptStatus(L.status),
        txHash,
        timestamp,
      });
    }
  }

  let network = "";
  let token = "";
  const src = d.source;
  if (src && typeof src === "object") {
    const s = src as Record<string, unknown>;
    network = String(s.network ?? "");
    token = String(s.currency ?? "");
  }
  const dest = d.destination;
  if (dest && typeof dest === "object") {
    const r = dest as Record<string, unknown>;
    const recipient = r.recipient;
    if (recipient && typeof recipient === "object") {
      const meta = (recipient as Record<string, unknown>).metadata;
      if (meta && typeof meta === "object") {
        const m = meta as Record<string, unknown>;
        if (!network) network = String(m.network ?? "");
        if (!token) token = String(m.token ?? m.currency ?? "");
      }
    }
  }

  const updatedAtRaw = d.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "string"
      ? updatedAtRaw
      : updatedAtRaw instanceof Date
        ? updatedAtRaw.toISOString()
        : new Date().toISOString();

  const rateRaw = d.rate;
  const rate =
    rateRaw != null && String(rateRaw).trim() !== ""
      ? String(rateRaw)
      : undefined;

  return {
    orderId: String(d.id ?? ""),
    amount: String(d.amount ?? ""),
    token,
    network,
    settlePercent: String(d.percentSettled ?? "0"),
    status: d.status,
    txHash: String(d.txHash ?? ""),
    rate,
    settlements: [],
    txReceipts,
    updatedAt,
  };
}

/** Base URL without trailing `/v1` so v2 paths are `{origin}/v2/...` not `{origin}/v1/v2/...`. */
export function aggregatorOriginForV2(): string {
  const raw = (AGGREGATOR_URL || "").trim();
  if (!raw) {
    throw new Error("NEXT_PUBLIC_AGGREGATOR_URL is not configured");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_AGGREGATOR_URL must be a valid absolute URL (e.g. https://api.example.com/v1)",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      "NEXT_PUBLIC_AGGREGATOR_URL must use http: or https:",
    );
  }
  const basePath = parsed.pathname
    .replace(/\/v1\/?$/i, "")
    .replace(/\/$/, "");
  return `${parsed.origin}${basePath}`;
}

function buildV2SenderOrderUrl(orderId: string): string {
  return `${aggregatorOriginForV2()}/v2/sender/orders/${encodeURIComponent(orderId)}`;
}

function buildGatewayOrderStatusUrl(orderId: string, networkName: string): string {
  const chainId = resolveChainIdFromNetworkName(networkName);
  if (chainId == null) {
    throw new Error(`Unknown network for order lookup: ${networkName}`);
  }
  return `${aggregatorOriginForV2()}/v2/orders/${chainId}/${encodeURIComponent(orderId.trim())}`;
}

/** Maps GET /v2/orders/:chainId/:id (gateway) into `OrderDetailsData`. */
export function mapProviderOrderStatusToOrderDetailsData(
  raw: unknown,
): OrderDetailsData | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;

  const txReceipts: OrderDetailsData["txReceipts"] = [];
  if (Array.isArray(d.txReceipts)) {
    for (const item of d.txReceipts) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      txReceipts.push({
        status: String(r.status ?? ""),
        txHash: String(r.txHash ?? ""),
        timestamp:
          typeof r.timestamp === "string"
            ? r.timestamp
            : r.timestamp instanceof Date
              ? r.timestamp.toISOString()
              : String(r.timestamp ?? ""),
      });
    }
  }

  const settlements: OrderDetailsData["settlements"] = [];
  if (Array.isArray(d.settlements)) {
    for (const item of d.settlements) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      settlements.push({
        splitOrderId: String(s.splitOrderId ?? ""),
        amount: String(s.amount ?? ""),
        rate: String(s.rate ?? ""),
        orderPercent: String(s.orderPercent ?? ""),
      });
    }
  }

  const updatedAtRaw = d.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === "string"
      ? updatedAtRaw
      : updatedAtRaw instanceof Date
        ? updatedAtRaw.toISOString()
        : new Date().toISOString();

  const rateRaw = d.rate;
  let rate =
    rateRaw != null && String(rateRaw).trim() !== ""
      ? String(rateRaw)
      : undefined;
  if (!rate && settlements[0]?.rate) {
    const settlementRate = settlements[0].rate.trim();
    if (settlementRate !== "") rate = settlementRate;
  }

  return {
    orderId: String(d.orderId ?? ""),
    amount: String(d.amount ?? ""),
    token: String(d.token ?? ""),
    network: String(d.network ?? ""),
    settlePercent: String(d.settlePercent ?? "0"),
    status: String(d.status ?? ""),
    txHash: String(d.txHash ?? ""),
    rate,
    settlements,
    txReceipts,
    updatedAt,
  };
}

function pickV2RateQuote(
  quotes: V2RateQuoteResponse,
  side: RateSide,
): { rate: string } | undefined {
  return side === "buy" ? quotes.buy : quotes.sell;
}

/**
 * Fetches the current exchange rate via aggregator **v2** (buy = onramp, sell = offramp).
 * @param params.network - Required; sent as path segment (e.g. "arbitrum-one").
 * @param params.side - `"buy"` or `"sell"`.
 */
export const fetchRate = async ({
  token,
  amount = 1,
  currency,
  providerId,
  network,
  side,
  signal,
}: RatePayload): Promise<RateResponse> => {
  const startTime = Date.now();
  const analyticsEndpoint = "/v2/rates";
  const net = (network || "").trim().toLowerCase();

  if (!net) {
    throw new Error("network is required for rate quotes");
  }

  const origin = aggregatorOriginForV2();
  const endpoint = `${origin}/v2/rates/${encodeURIComponent(net)}/${encodeURIComponent(token)}/${amount}/${encodeURIComponent(currency)}`;
  const params: Record<string, string> = {
    side,
  };
  if (providerId) {
    params.provider_id = providerId;
  }

  try {
    trackServerEvent("External API Request", {
      service: "aggregator",
      endpoint: analyticsEndpoint,
      method: "GET",
      token,
      amount,
      currency,
      provider_id: providerId,
      network: net,
      side,
    });

    const response = await axios.get(endpoint, { params, signal });
    const payload = response.data as {
      status: string;
      message: string;
      data: V2RateQuoteResponse;
    };

    if (payload.status === "error") {
      throw new Error(payload.message || "Rate request failed");
    }

    const sideQuote = pickV2RateQuote(payload.data ?? {}, side);
    if (!sideQuote?.rate) {
      throw new Error(
        payload.message || `No ${side} rate returned for this pair`,
      );
    }

    const numericRate = Number(sideQuote.rate);
    if (!Number.isFinite(numericRate)) {
      throw new Error("Invalid rate value from aggregator");
    }

    const normalized: RateResponse = {
      status: payload.status,
      message: payload.message,
      data: numericRate,
    };

    const responseTime = Date.now() - startTime;
    trackApiResponse(analyticsEndpoint, "GET", 200, responseTime, {
      service: "aggregator",
      token,
      amount,
      currency,
      provider_id: providerId,
      network: net,
      side,
      rate: numericRate,
    });

    trackBusinessEvent("Rate Fetched", {
      token,
      amount,
      currency,
      provider_id: providerId,
      network: net,
      side,
      rate: numericRate,
    });

    return normalized;
  } catch (error) {
    const responseTime = Date.now() - startTime;

    const axiosPayloadMessage =
      axios.isAxiosError(error) &&
      error.response?.data &&
      typeof (error.response.data as { message?: unknown }).message === "string"
        ? (error.response.data as { message: string }).message
        : null;

    const errorMessage =
      axiosPayloadMessage ??
      (error instanceof Error ? error.message : "Unknown error");

    trackServerEvent("External API Error", {
      service: "aggregator",
      endpoint: analyticsEndpoint,
      method: "GET",
      token,
      amount,
      currency,
      provider_id: providerId,
      network: net,
      side,
      error_message: errorMessage,
      response_time_ms: responseTime,
    });

    const errorForClassification = axiosPayloadMessage
      ? { message: axiosPayloadMessage }
      : error;

    if (isNoProviderError(errorForClassification)) {
      trackServerEvent("No Provider Found", {
        service: "aggregator",
        endpoint: analyticsEndpoint,
        token_symbol: token,
        currency,
        network: net,
        side,
        provider_id: providerId ?? null,
        query_amount: amount,
        error_message: errorMessage.slice(0, 200),
        source: "rate_quote",
      });
    }

    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      throw new Error(message);
    }
    console.error("Error fetching rate:", error);
    throw error;
  }
};

// The order book is refreshed by a polling hook and can be read by more than
// one consumer per tick; share one request and result so the poll interval
// (not the consumer count) sets the request rate. The aggregator caches the
// full book ~10s upstream, so a matching TTL here costs no freshness.
const MARKETS_TTL_MS = 10 * 1000;
/**
 * The rate quote waits on the first book for a corridor, so this request has
 * to fail rather than hang: a stalled connection would otherwise hold back the
 * quote indefinitely. Failing lands on the unknown-book path, which quotes
 * against the static limits exactly as before this feature existed.
 */
const MARKETS_TIMEOUT_MS = 8 * 1000;
const marketsInFlight = new Map<string, Promise<V2MarketOffer[]>>();
const marketsResult = new Map<string, { at: number; data: V2MarketOffer[] }>();

function marketsCacheKey({ side, token, currency, network }: MarketsPayload) {
  return `${side}:${token}:${currency}:${network || "*"}`;
}

/**
 * Pulls the offer rows out of an aggregator response without assuming the
 * exact envelope shape. The documented form is `data.book`, but a bare array
 * or `data` as an array also resolve. An unrecognized shape yields `[]`,
 * which callers treat as "unknown" and fall back to their static limits
 * rather than blocking the user.
 */
function extractMarketOffers(raw: unknown): V2MarketOffer[] {
  if (Array.isArray(raw)) return raw as V2MarketOffer[];
  if (!raw || typeof raw !== "object") return [];

  const container = raw as Record<string, unknown>;
  if (Array.isArray(container.data)) return container.data as V2MarketOffer[];

  const nested =
    container.data && typeof container.data === "object"
      ? (container.data as Record<string, unknown>)
      : container;

  for (const key of ["book", "offers", "markets"]) {
    if (Array.isArray(nested[key])) return nested[key] as V2MarketOffer[];
  }

  const arrayValue = Object.values(nested).find((value) =>
    Array.isArray(value),
  );
  return Array.isArray(arrayValue) ? (arrayValue as V2MarketOffer[]) : [];
}

/**
 * Fetches the live provider order book for one corridor via aggregator **v2**.
 * Used to derive the fillable amount range shown in the swap form; an empty
 * result means "unknown", not "no liquidity".
 */
export const fetchMarkets = async (
  payload: MarketsPayload,
): Promise<V2MarketOffer[]> => {
  const { side, token, currency, network, signal } = payload;
  const key = marketsCacheKey(payload);

  const cached = marketsResult.get(key);
  if (cached && Date.now() - cached.at < MARKETS_TTL_MS) {
    return cached.data;
  }
  const inFlight = marketsInFlight.get(key);
  if (inFlight) return inFlight;

  const startTime = Date.now();
  const analyticsEndpoint = "/v2/markets";
  const endpoint = `${aggregatorOriginForV2()}/v2/markets`;
  const params: Record<string, string> = { side, fiat: currency, token };
  if (network) params.network = network;

  const request = (async () => {
    try {
      trackServerEvent("External API Request", {
        service: "aggregator",
        endpoint: analyticsEndpoint,
        method: "GET",
        token,
        currency,
        network: network ?? null,
        side,
      });

      const response = await axios.get(endpoint, {
        params,
        signal,
        timeout: MARKETS_TIMEOUT_MS,
      });
      const body = response.data as {
        status?: string;
        message?: string;
        data?: unknown;
      };

      if (body?.status === "error") {
        throw new Error(body.message || "Markets request failed");
      }

      const offers = extractMarketOffers(response.data);
      marketsResult.set(key, { at: Date.now(), data: offers });

      trackApiResponse(analyticsEndpoint, "GET", 200, Date.now() - startTime, {
        service: "aggregator",
        token,
        currency,
        network: network ?? null,
        side,
        offer_count: offers.length,
      });

      return offers;
    } catch (error) {
      const axiosPayloadMessage =
        axios.isAxiosError(error) &&
        error.response?.data &&
        typeof (error.response.data as { message?: unknown }).message ===
          "string"
          ? (error.response.data as { message: string }).message
          : null;

      const errorMessage =
        axiosPayloadMessage ??
        (error instanceof Error ? error.message : "Unknown error");

      trackServerEvent("External API Error", {
        service: "aggregator",
        endpoint: analyticsEndpoint,
        method: "GET",
        token,
        currency,
        network: network ?? null,
        side,
        error_message: errorMessage,
        response_time_ms: Date.now() - startTime,
      });

      throw new Error(errorMessage);
    } finally {
      marketsInFlight.delete(key);
    }
  })();

  marketsInFlight.set(key, request);
  return request;
};

/**
 * Fetches the list of supported institutions for a given currency
 * @param {string} currency - The currency code to get institutions for
 * @returns {Promise<InstitutionProps[]>} Array of supported institutions
 * @throws {Error} If the API request fails
 */
export const fetchSupportedInstitutions = async (
  currency: string,
): Promise<InstitutionProps[]> => {
  try {
    const response = await axios.get(
      `${AGGREGATOR_URL}/institutions/${currency}`,
    );
    return response.data.data;
  } catch (error) {
    console.error("Error fetching supported institutions:", error);
    throw error;
  }
};

/**
 * Fetches the aggregator's public key for encryption
 * @returns {Promise<PubkeyResponse>} The public key response
 * @throws {Error} If the API request fails
 */
/** Bounded so a stalled aggregator surfaces as an error (axios has no default timeout). */
const PUBKEY_TIMEOUT_MS = 10_000;

export const fetchAggregatorPublicKey = async (): Promise<PubkeyResponse> => {
  try {
    const response = await axios.get(`${AGGREGATOR_URL}/pubkey`, {
      timeout: PUBKEY_TIMEOUT_MS,
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching aggregator public key:", error);
    throw error;
  }
};

/**
 * Verifies an account number and returns the account name
 * @param {VerifyAccountPayload} payload - The account verification payload
 * @returns {Promise<string>} The account holder's name
 * @throws {Error} If the API request fails
 */
export const fetchAccountName = async (
  payload: VerifyAccountPayload,
): Promise<string> => {
  const startTime = Date.now();

  try {
    // Track external API request
    trackServerEvent("External API Request", {
      service: "aggregator",
      endpoint: "/verify-account",
      method: "POST",
      institution: payload.institution,
      // account_identifier omitted to avoid PII in analytics
    });

    const response = await axios.post(
      `${AGGREGATOR_URL}/verify-account`,
      payload,
    );

    // Track successful response
    const responseTime = Date.now() - startTime;
    trackApiResponse("/verify-account", "POST", 200, responseTime, {
      service: "aggregator",
      institution: payload.institution,
      // account_identifier omitted
      // account_name omitted
    });

    // Track business event
    trackBusinessEvent("Account Verification", {
      institution: payload.institution,
    });

    return response.data.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;

    // Track API error
    trackServerEvent("External API Error", {
      service: "aggregator",
      endpoint: "/verify-account",
      method: "POST",
      institution: payload.institution,
      // account_identifier omitted
      error_message: error instanceof Error ? error.message : "Unknown error",
      response_time_ms: responseTime,
    });

    console.error("Error fetching account name:", error);
    throw error;
  }
};

/**
 * Fetches payment order status from the aggregator (via Noblocks proxy in the browser).
 *
 * - **Onramp** (UUID): `GET /v2/sender/orders/:id`
 * - **Offramp** (gateway `0x…` bytes32): `GET /v2/orders/:chainId/:id` — requires `network`
 *   (Noblocks `transactions.network` / chain display name).
 */
export const fetchOrderDetails = async (
  orderId: string,
  accessToken?: string | null,
  options?: { network?: string; injectedToken?: string | null },
): Promise<OrderDetailsResponse> => {
  const id = orderId.trim();
  if (!id) {
    throw new Error("orderId is required");
  }

  const network = options?.network?.trim() ?? "";
  const gatewayLookup =
    isGatewayOrderId(id) ||
    (isStarknetOrderId(id) && network === "Starknet");
  if (gatewayLookup && !network) {
    throw new Error(
      "Network is required to look up an offramp order by gateway id",
    );
  }

  let envelope: {
    status?: string;
    message?: string;
    data?: unknown;
  };

  const injectedToken = options?.injectedToken?.trim();

  if (typeof window !== "undefined") {
    // Browser: always go through the Noblocks proxy. The direct aggregator
    // path below attaches the sender API key, which is server-only.
    if (!accessToken?.trim() && !injectedToken) {
      throw new Error("Authentication required to fetch order details");
    }
    const headers: Record<string, string> = {};
    if (injectedToken) {
      headers["x-injected-token"] = injectedToken;
    } else {
      headers.Authorization = `Bearer ${accessToken!.trim()}`;
    }
    const response = await axios.get(
      `/api/v1/payment-orders/${encodeURIComponent(id)}`,
      {
        headers,
        params:
          gatewayLookup && network
            ? { network }
            : undefined,
        validateStatus: () => true,
      },
    );
    envelope = response.data;
    if (response.status >= 400) {
      throw new Error(
        typeof envelope?.message === "string"
          ? envelope.message
          : `Order request failed (${response.status})`,
      );
    }
  } else {
    const url = gatewayLookup
      ? buildGatewayOrderStatusUrl(id, options!.network!.trim())
      : buildV2SenderOrderUrl(id);
    const headers: Record<string, string> = {};
    if (!gatewayLookup) {
      const apiKey = getAggregatorSenderApiKey();
      if (!apiKey) {
        throw new Error("AGGREGATOR_SENDER_API_KEY_ID is not configured");
      }
      headers["API-Key"] = apiKey;
    }
    const response = await axios.get(url, {
      headers,
      validateStatus: () => true,
    });
    envelope = response.data;
    if (response.status >= 400) {
      throw new Error(
        typeof envelope?.message === "string"
          ? envelope.message
          : `Order request failed (${response.status})`,
      );
    }
  }

  if (!envelope || envelope.status === "error") {
    throw new Error(
      typeof envelope?.message === "string"
        ? envelope.message
        : "Order fetch failed",
    );
  }

  const mapped = gatewayLookup
    ? mapProviderOrderStatusToOrderDetailsData(envelope.data)
    : mapV2SenderOrderGetToOrderDetailsData(envelope.data);
  if (!mapped) {
    throw new Error("Invalid order payload from aggregator");
  }

  return {
    status: String(envelope.status ?? "success"),
    message: String(envelope.message ?? ""),
    data: mapped,
  };
};

/**
 * Initiates the KYC process for a user
 * @param {InitiateKYCPayload} payload - The KYC initiation payload
 * @returns {Promise<InitiateKYCResponse>} The KYC initiation response
 * @throws {Error} If the API request fails
 */
export const initiateKYC = async (
  payload: InitiateKYCPayload,
): Promise<InitiateKYCResponse> => {
  const startTime = Date.now();

  try {
    // Track external API request
    trackServerEvent("External API Request", {
      service: "aggregator",
      endpoint: "/kyc",
      method: "POST",
      wallet_address: payload.walletAddress,
    });

    const response = await axios.post(`${AGGREGATOR_URL}/kyc`, payload);

    // Track successful response
    const responseTime = Date.now() - startTime;
    trackApiResponse("/kyc", "POST", 200, responseTime, {
      service: "aggregator",
      wallet_address: payload.walletAddress,
      // kyc_url omitted
    });

    // Track business event
    trackBusinessEvent("KYC Initiated", {
      wallet_address: payload.walletAddress,
    });

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;

    // Track API error
    trackServerEvent("External API Error", {
      service: "aggregator",
      endpoint: "/kyc",
      method: "POST",
      wallet_address: payload.walletAddress,
      error_message: error instanceof Error ? error.message : "Unknown error",
      response_time_ms: responseTime,
    });

    throw error;
  }
};

/**
 * Fetches the KYC status for a wallet address
 * @param {string} walletAddress - The wallet address to check
 * @returns {Promise<KYCStatusResponse>} The KYC status response
 * @throws {Error} If the API request fails
 */
export const fetchKYCStatus = async (
  walletAddress: string,
): Promise<KYCStatusResponse> => {
  const startTime = Date.now();

  try {
    // Track external API request
    trackServerEvent("External API Request", {
      service: "aggregator",
      endpoint: "/kyc/status",
      method: "GET",
      wallet_address: walletAddress,
    });

    const response = await axios.get(`${AGGREGATOR_URL}/kyc/${walletAddress}`);

    // Track successful response
    const responseTime = Date.now() - startTime;
    trackApiResponse("/kyc/status", "GET", 200, responseTime, {
      service: "aggregator",
      wallet_address: walletAddress,
      kyc_status: response.data.data?.status,
    });

    // Track business event
    trackBusinessEvent("KYC Status Checked", {
      wallet_address: walletAddress,
      kyc_status: response.data.data?.status,
    });

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;

    // Track API error
    trackServerEvent("External API Error", {
      service: "aggregator",
      endpoint: "/kyc/status",
      method: "GET",
      wallet_address: walletAddress,
      error_message: error instanceof Error ? error.message : "Unknown error",
      response_time_ms: responseTime,
    });

    throw error;
  }
};

/**
 * Detects the user's location based on their IP address
 * @returns {Promise<string>} The country code of the user's location
 * @throws {Error} If the API request fails
 */
export const detectUserLocation = async (): Promise<string> => {
  try {
    const response = await axios.get("https://ipapi.co/json/");
    return response.data.country_code;
  } catch (error) {
    console.error("Error detecting user location:", error);
    return "";
  }
};

/**
 * Fetches transactions for a wallet address with pagination
 * @param {string} address - The wallet address
 * @param {string} accessToken - The access token for authentication
 * @param {number} [page=1] - The page number
 * @param {number} [limit=20] - The number of items per page
 * @param {string | null} [injectedToken] - Injected wallet SIWE session token
 * @returns {Promise<TransactionResponse>} The transactions response
 * @throws {Error} If the API request fails
 */
export async function fetchTransactions(
  address: string,
  accessToken: string | null,
  page: number = 1,
  limit: number = 20,
  injectedToken: string | null = null,
): Promise<TransactionResponse> {
  const headers: Record<string, string> = {
    "x-wallet-address": address.toLowerCase(),
  };
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const response = await axios.get<TransactionResponse>(
    `/api/v1/transactions?page=${page}&limit=${limit}`,
    { headers },
  );
  return response.data;
}

/**
 * Saves a new transaction to the database
 * @param {TransactionCreateInput} transaction - The transaction data to save
 * @param {string} accessToken - The access token for authentication
 * @returns {Promise<SaveTransactionResponse>} The save response
 * @throws {Error} If the API request fails
 */
export async function saveTransaction(
  transaction: TransactionCreateInput,
  accessToken: string | null,
  injectedToken: string | null = null,
): Promise<SaveTransactionResponse> {
  const headers: Record<string, string> = {
    // Same intent as middleware primary wallet; overwritten by middleware for browser,
    // but clarifies signer for proxies and matches fetchTransactions/update patterns.
    "x-wallet-address": String(transaction.walletAddress).toLowerCase(),
  };
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const response = await axios.post("/api/v1/transactions", transaction, {
    headers,
  });
  return response.data;
}

export type SwapPrecheckPayload = Pick<
  TransactionCreateInput,
  | "walletAddress"
  | "fromCurrency"
  | "toCurrency"
  | "amountSent"
  | "amountReceived"
  | "fee"
> & {
  recipient?: TransactionCreateInput["recipient"];
  /** Defaults to offramp; pass onramp for fiat → crypto limit checks. */
  transactionType?: "offramp" | "onramp";
};

/**
 * Server-side monthly KYC limit check (RPC dry run) before on-chain swap steps.
 * Throws Error with the API message when the swap would be rejected at save time.
 * Injected wallets authenticate via `x-injected-token`; Privy via Bearer.
 */
export async function precheckSwapTransaction(
  payload: SwapPrecheckPayload,
  accessToken: string | null,
  injectedToken: string | null = null,
): Promise<void> {
  const headers: Record<string, string> = {
    "x-wallet-address": String(payload.walletAddress).toLowerCase(),
  };
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await axios.post<{ success?: boolean; error?: string }>(
    "/api/v1/transactions/swap-precheck",
    payload,
    {
      headers,
      validateStatus: () => true,
    },
  );
  if (!res.data?.success) {
    const msg =
      typeof res.data?.error === "string"
        ? res.data.error
        : "Unable to verify transaction limits. Please try again.";
    throw new Error(msg);
  }
}

/**
 * Updates the status of a transaction
 * @param {string} transactionId - The ID of the transaction to update
 * @param {string} status - The new status to set
 * @param {string} accessToken - The access token for authentication
 * @param {string} walletAddress - The wallet address for authorization
 * @returns {Promise<SaveTransactionResponse>} The update response
 * @throws {Error} If the API request fails
 */
/**
 * Directly sets the DB status for a bridge transaction without going through
 * mapAggregatorStatusToDbStatus (which is designed for Paycrest aggregator statuses,
 * not NEAR Intents / LI.FI terminal states).
 */
export async function updateBridgeTransactionStatus(
  transactionId: string,
  status: "completed" | "refunded" | "failed",
  accessToken: string | null,
  walletAddress: string,
  injectedToken: string | null = null,
): Promise<void> {
  const headers: Record<string, string> = {
    "x-wallet-address": walletAddress.toLowerCase(),
  };
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  await axios.put(
    `/api/v1/transactions/status/${transactionId}`,
    { status },
    { headers },
  );
}

export async function updateTransactionStatus({
  transactionId,
  status,
  accessToken,
  walletAddress,
  injectedToken = null,
}: UpdateTransactionStatusPayload): Promise<SaveTransactionResponse> {
  const finalStatus = mapAggregatorStatusToDbStatus(status, { onramp: false });

  const headers: Record<string, string> = {
    "x-wallet-address": walletAddress.toLowerCase(),
  };
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await axios.put(
    `/api/v1/transactions/status/${transactionId}`,
    { status: finalStatus },
    { headers },
  );
  return response.data;
}

/**
 * Updates the details of a transaction including status, hash, and time spent
 * @param {Object} params - The parameters object
 * @param {string} params.transactionId - The ID of the transaction to update
 * @param {string} params.status - The new status to set
 * @param {string} [params.txHash] - The transaction hash (optional)
 * @param {string} [params.timeSpent] - The time spent on the transaction (optional)
 * @param {string} params.accessToken - The access token for authentication
 * @param {string} params.walletAddress - The wallet address for authorization
 * @param {string} [params.injectedToken] - Injected wallet SIWE session token
 * @returns {Promise<SaveTransactionResponse>} The update response
 * @throws {Error} If the API request fails
 */
export async function updateTransactionDetails({
  transactionId,
  status,
  txHash,
  timeSpent,
  accessToken,
  walletAddress,
  injectedToken = null,
  isOnramp,
}: UpdateTransactionDetailsPayload): Promise<SaveTransactionResponse> {
  const finalStatus = mapAggregatorStatusToDbStatus(status, {
    onramp: isOnramp === true,
  });

  // Build the data object dynamically
  const data: Record<string, any> = { status: finalStatus };
  if (txHash !== undefined && txHash !== null && txHash !== "") {
    data.txHash = txHash;
  }
  if (timeSpent !== undefined && timeSpent !== null && timeSpent !== "") {
    data.timeSpent = timeSpent;
  }

  const headers: Record<string, string> = {
    "x-wallet-address": walletAddress.toLowerCase(),
  };
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await axios.put(
    `/api/v1/transactions/${transactionId}`,
    data,
    { headers },
  );
  return response.data;
}

/**
 * Reindexes a transaction on the Paycrest API with exponential retry
 * @param {string} network - The network identifier (e.g., "base", "bnb-smart-chain", "polygon")
 * @param {string} txHash - The transaction hash to reindex
 * @param {number} retryCount - Current retry attempt (internal use)
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @returns {Promise<any>} The reindex response
 * @throws {Error} If the API request fails after all retries
 */
export async function reindexTransaction(
  network: string,
  txHash: string,
  retryCount: number = 0,
  maxRetries: number = 3,
): Promise<any> {
  const startTime = Date.now();

  try {
    // Track external API request
    trackServerEvent("External API Request", {
      service: "aggregator",
      endpoint: `/reindex/${network}/${txHash}`,
      method: "GET",
      network,
      tx_hash: txHash,
      retry_attempt: retryCount,
    });

    const endpoint = `${AGGREGATOR_URL}/reindex/${network}/${txHash}`;
    const response = await axios.get(endpoint);

    // Track successful response (2xx status)
    const responseTime = Date.now() - startTime;
    const status = response.status;

    trackApiResponse(
      `/reindex/${network}/${txHash}`,
      "GET",
      status,
      responseTime,
      {
        service: "aggregator",
        network,
        tx_hash: txHash,
        retry_attempt: retryCount,
      },
    );

    // Track business event
    trackBusinessEvent("Transaction Reindexed", {
      network,
      tx_hash: txHash,
      retry_attempt: retryCount,
    });

    return response.data;
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    const status = error.response?.status;

    // Check if we should retry:
    // 1. Network errors (no response) - retry (transient)
    // 2. 5xx server errors - retry (transient)
    // 3. 4xx client errors - do NOT retry (bad request, fail fast)
    // Note: axios throws errors for status >= 400, so 2xx responses won't reach here
    const isNetworkError = !error.response;
    const is5xxError = status !== undefined && status >= 500;
    // retryCount + 1 represents the next attempt number; ensure it doesn't exceed maxRetries
    const shouldRetry =
      (isNetworkError || is5xxError) && retryCount + 1 < maxRetries;

    if (shouldRetry) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
      const errorType = isNetworkError ? "network error" : `status ${status}`;
      console.debug(
        `Reindex failed with ${errorType}, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay)); // sleep for delay
      return reindexTransaction(network, txHash, retryCount + 1, maxRetries);
    }

    // Track API error
    trackApiResponse(
      `/reindex/${network}/${txHash}`,
      "GET",
      status,
      responseTime,
      {
        service: "aggregator",
        network,
        tx_hash: txHash,
        error: error.message,
        retry_attempt: retryCount,
      },
    );

    // Re-throw error for caller to handle
    throw error;
  }
}

// The token list is fetched independently by TokensContext and the
// utils-level cache on every page load; share one request and result here so
// they stop racing each other (each round-trip is ~1s from the aggregator).
const TOKENS_TTL_MS = 5 * 60 * 1000;
let tokensInFlight: Promise<APIToken[]> | null = null;
let tokensResult: { at: number; data: APIToken[] } | null = null;

/**
 * Fetches the list of supported tokens from the aggregator API.
 * Concurrent callers share one request; results are cached for 5 minutes.
 * @returns {Promise<APIToken[]>} Array of supported tokens from the API
 * @throws {Error} If the API request fails
 */
export const fetchTokens = async (): Promise<APIToken[]> => {
  if (tokensResult && Date.now() - tokensResult.at < TOKENS_TTL_MS) {
    return tokensResult.data;
  }
  if (tokensInFlight) {
    return tokensInFlight;
  }
  tokensInFlight = (async () => {
    try {
      const response = await axios.get(`${AGGREGATOR_URL}/tokens`);
      const data =
        response.data?.data && Array.isArray(response.data.data)
          ? (response.data.data as APIToken[])
          : [];
      tokensResult = { at: Date.now(), data };
      return data;
    } catch (error) {
      console.error("Error fetching supported tokens from API:", error);
      throw error;
    } finally {
      tokensInFlight = null;
    }
  })();
  return tokensInFlight;
};

/**
 * Fetches fiat currency codes currently enabled by the aggregator.
 * Currencies omitted from this response are unavailable in the active environment.
 */
export const fetchSupportedCurrencyCodes = async (): Promise<string[]> => {
  const response = await axios.get(`${aggregatorOriginForV2()}/v2/currencies`);
  const currencies = response.data?.data;

  if (!Array.isArray(currencies)) {
    throw new Error("Invalid currencies response from aggregator");
  }

  return currencies
    .map((currency: unknown) => {
      if (!currency || typeof currency !== "object") return "";
      const code = (currency as { code?: unknown }).code;
      return typeof code === "string" ? code.trim().toUpperCase() : "";
    })
    .filter(Boolean);
};

/**
 * Fetches saved recipients for a wallet address
 * @param {string} accessToken - The access token for authentication
 * @returns {Promise<RecipientDetailsWithId[]>} Array of saved recipients
 * @throws {Error} If the API request fails
 */
type RefundAccountApiEnvelope = {
  success: boolean;
  data: RefundAccountDetails | null;
  error?: string;
};

type RefundAccountSaveEnvelope = {
  success: boolean;
  data?: RefundAccountDetails;
  error?: string;
};

/**
 * Loads the saved refund account for the authenticated wallet and fiat currency, if any.
 * Injected wallets authenticate via `x-injected-token`; Privy via Bearer.
 */
export async function fetchRefundAccount(
  currency: string,
  accessToken: string | null,
  injectedToken: string | null = null,
): Promise<RefundAccountDetails | null> {
  const headers: Record<string, string> = {};
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const response = await axios.get<RefundAccountApiEnvelope>(
    "/api/v1/refund-account",
    {
      headers,
      params: { currency: currency.trim().toUpperCase() },
    },
  );

  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to load refund account");
  }

  return response.data.data;
}

/**
 * Upserts refund account details for the authenticated wallet and fiat currency.
 * Injected wallets authenticate via `x-injected-token`; Privy via Bearer.
 */
export async function saveRefundAccount(
  detail: RefundAccountDetails,
  accessToken: string | null,
  injectedToken: string | null = null,
): Promise<RefundAccountDetails> {
  const headers: Record<string, string> = {};
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  let response: { data: RefundAccountSaveEnvelope };
  try {
    response = await axios.put<RefundAccountSaveEnvelope>(
      "/api/v1/refund-account",
      {
        currency: detail.currency.trim().toUpperCase(),
        institution: detail.institutionName,
        institutionCode: detail.institutionCode,
        accountIdentifier: detail.accountNumber,
        accountName: detail.accountName,
      },
      { headers },
    );
  } catch (err) {
    // Surface the server's error message (e.g. the refund-account name policy rejection) instead of
    // axios's generic "Request failed with status code 4xx".
    if (axios.isAxiosError(err) && typeof err.response?.data?.error === "string") {
      throw new Error(err.response.data.error);
    }
    throw err;
  }

  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.error || "Failed to save refund account");
  }

  return response.data.data;
}

export async function fetchSavedRecipients(
  accessToken: string,
): Promise<RecipientDetailsWithId[]> {
  const response = await axios.get<SavedRecipientsResponse>(
    "/api/v1/recipients",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to fetch recipients");
  }

  return response.data.data;
}

/**
 * Saves a new recipient
 * @param {RecipientDetails} recipient - The recipient data to save
 * @param {string} accessToken - The access token for authentication
 * @returns {Promise<boolean>} Success status
 * @throws {Error} If the API request fails
 */
export async function saveRecipient(
  recipient: RecipientDetails,
  accessToken: string,
): Promise<boolean> {
  try {
    const response = await axios.post("/api/v1/recipients", recipient, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.data.success) {
      throw new Error(response.data.error || "Failed to save recipient");
    }

    return true;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data;
      throw new Error(errorData?.error || error.message);
    }
    throw error;
  }
}

/**
 * Deletes a saved recipient
 * @param {string} recipientId - The ID of the recipient to delete
 * @param {string} accessToken - The access token for authentication
 * @returns {Promise<boolean>} Success status
 * @throws {Error} If the API request fails
 */
export async function deleteSavedRecipient(
  recipientId: string,
  accessToken: string,
): Promise<boolean> {
  const response = await axios.delete(`/api/v1/recipients?id=${recipientId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to delete recipient");
  }

  return true;
}

/**
 * Migrates recipients from localStorage to Supabase
 * @param {string} accessToken - The access token for authentication
 * @returns {Promise<void>}
 */
export async function migrateLocalStorageRecipients(
  accessToken: string,
): Promise<void> {
  const migrationKey = `recipientsMigrated-${localStorage.getItem("userId")}`;

  // Check if migration has already been done
  if (localStorage.getItem(migrationKey)) {
    return;
  }

  try {
    const savedRecipients = localStorage.getItem("savedRecipients");
    if (!savedRecipients) {
      localStorage.setItem(migrationKey, "true");
      return;
    }

    const recipients: RecipientDetails[] = JSON.parse(savedRecipients);

    if (!Array.isArray(recipients) || recipients.length === 0) {
      localStorage.setItem(migrationKey, "true");
      return;
    }

    // First, fetch existing recipients from DB to check for duplicates
    const existingRecipients = await fetchSavedRecipients(accessToken);
    const existingKeys = new Set(
      existingRecipients.map((r) => {
        if (r.type === "wallet") {
          if (!r.walletAddress) {
            console.warn("Wallet recipient missing walletAddress", r);
            return `wallet-invalid-${r.id}`;
          }
          return `wallet-${r.walletAddress}`;
        } else {
          if (!r.institutionCode || !r.accountIdentifier) {
            console.warn("Bank/mobile_money recipient missing required fields", r);
            return `${r.type}-invalid-${r.id}`;
          }
          return `${r.institutionCode}-${r.accountIdentifier}`;
        }
      }),
    );

    // Filter out duplicates - only migrate recipients that don't exist in DB
    const recipientsToMigrate = recipients.filter((recipient) => {
      const key = recipient.type === "wallet"
        ? `wallet-${recipient.walletAddress}`
        : `${recipient.institutionCode}-${recipient.accountIdentifier}`;
      return !existingKeys.has(key);
    });

    if (recipientsToMigrate.length === 0) {
      console.log("All recipients already exist in cloud storage");
      localStorage.removeItem("savedRecipients");
      localStorage.setItem(migrationKey, "true");
      return;
    }

    // Migrate only new recipients to Supabase using batch processing
    const migrationPromises = recipientsToMigrate.map(async (recipient) => {
      try {
        await saveRecipient(recipient, accessToken);
        return { success: true, recipient };
      } catch (error) {
        const recipientName = recipient.type === "wallet"
          ? recipient.walletAddress
          : recipient.name;
        console.error(`Failed to migrate recipient ${recipientName}:`, error);
        return { success: false, recipient, error };
      }
    });

    // Wait for all migrations to complete
    const results = await Promise.all(migrationPromises);

    const migratedCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    if (migratedCount > 0) {
      console.log(`Migrated ${migratedCount} recipients to cloud storage`);
    }
    if (failedCount > 0) {
      console.warn(`Failed to migrate ${failedCount} recipients`);
    }

    localStorage.removeItem("savedRecipients");
    localStorage.setItem(migrationKey, "true");
  } catch (error) {
    console.error("Error migrating recipients:", error);
    // Don't throw - let the app continue even if migration fails
  }
};

/**
 * Submits Smile ID captured data for KYC verification
 * @param {object} payload - The Smile ID data payload
 * @param {string} accessToken - The access token for authentication
 * @param {string} walletAddress - Wallet address for x-wallet-address header
 * @returns {Promise<SmileIDSubmissionResponse>} The submission response
 * @throws {Error} If the API request fails
 */
export const submitSmileIDData = async (
  payload: any,
  accessToken: string | null,
  walletAddress: string,
  injectedToken: string | null = null,
): Promise<SmileIDSubmissionResponse> => {
  const startTime = Date.now();

  try {
    // Track external API request (log metadata only, no PII)
    trackServerEvent("External API Request", {
      service: "next-api",
      endpoint: "/api/kyc/smile-id",
      method: "POST",
    });

    // Auth is resolved by middleware: injected wallets authenticate via the
    // x-injected-token session JWT, Privy wallets via the Bearer token. The
    // middleware overwrites x-wallet-address from the verified identity, so the
    // client-supplied value is only a hint.
    const headers: Record<string, string> = {
      "x-wallet-address": walletAddress.toLowerCase(),
    };
    if (injectedToken) {
      headers["x-injected-token"] = injectedToken;
    } else if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    // Call Next.js API route with JWT authentication
    const response = await axios.post(`/api/kyc/smile-id`, payload, {
      headers,
    });

    // Track successful response
    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/kyc/smile-id", "POST", 200, responseTime, {
      service: "next-api",
    });

    // Track business event
    trackBusinessEvent("Smile ID Data Submitted", {
      jobId: response.data.data?.jobId,
    });

    return response.data;
  } catch (error) {
    const responseTime = Date.now() - startTime;

    // Track API error
    trackServerEvent("External API Error", {
      service: "next-api",
      endpoint: "/api/kyc/smile-id",
      method: "POST",
      error_message: error instanceof Error ? error.message : "Unknown error",
      response_time_ms: responseTime,
    });

    throw error;
  }
};

/**
 * Creates a v2 on-ramp payment order (fiat source) via the server proxy to aggregator.
 * POST /api/v1/payment-orders (on-ramp only) → aggregator POST /v2/sender/orders.
 * Off-ramp orders are created on-chain (gateway.createOrder), not through this proxy.
 * Injected wallets authenticate via `x-injected-token`; Privy via Bearer.
 */
export async function createV2SenderPaymentOrder(
  payload: V2CreatePaymentOrderPayload,
  accessToken: string | null,
  injectedToken: string | null = null,
): Promise<AggregatorEnvelope<V2PaymentOrderCreateData>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const response = await axios.post<AggregatorEnvelope<V2PaymentOrderCreateData>>(
    "/api/v1/payment-orders",
    payload,
    { headers },
  );
  return response.data;
}

/** Recipient fields the client supplies for an offramp order; the server adds the nonce and sender API key. */
export type OfframpMessageHashPayload = {
  accountIdentifier: string;
  accountName: string;
  institution: string;
  memo?: string;
  providerId?: string;
  kesChannel?: KesMpesaChannel;
  businessNumber?: string;
};

/**
 * Offramp only. Asks the server to build the encrypted recipient payload for
 * gateway.createOrder. The server generates the nonce, injects the sender API
 * key (which never reaches the browser), applies the KES M-Pesa metadata rules,
 * and RSA-encrypts with the aggregator public key. Returns the base64
 * ciphertext used as the on-chain `messageHash` argument.
 * Injected wallets authenticate via `x-injected-token`; Privy via Bearer.
 */
export async function createOfframpMessageHash(
  payload: OfframpMessageHashPayload,
  accessToken: string | null,
  injectedToken: string | null = null,
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  // validateStatus + manual throw: middleware 401s carry `{ error }` rather than
  // `{ message }`, and an axios throw on 5xx would collapse to the generic
  // server-error copy. This keeps the server's specific message when present.
  const response = await axios.post<AggregatorEnvelope<{ messageHash: string }>>(
    "/api/v1/payment-orders/message-hash",
    payload,
    { headers, validateStatus: () => true },
  );
  const envelope = response.data;
  const messageHash = envelope?.data?.messageHash;
  if (
    response.status >= 400 ||
    envelope?.status !== "success" ||
    typeof messageHash !== "string" ||
    !messageHash
  ) {
    throw new Error(
      typeof envelope?.message === "string" && envelope.message
        ? envelope.message
        : `Could not prepare order (${response.status})`,
    );
  }
  return messageHash;
}

/**
 * Fetches a single v2 sender order (e.g. to refresh fiat virtual account details).
 */
export async function fetchV2SenderPaymentOrderById(
  orderId: string,
  accessToken: string | null,
  injectedToken: string | null = null,
): Promise<AggregatorEnvelope<V2PaymentOrderGetData>> {
  const headers: Record<string, string> = {};
  if (injectedToken) {
    headers["x-injected-token"] = injectedToken;
  } else if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const response = await axios.get<AggregatorEnvelope<V2PaymentOrderGetData>>(
    `/api/v1/payment-orders/${encodeURIComponent(orderId)}`,
    { headers },
  );
  return response.data;
}

/**
 * Submit a referral code for a new user
 */
export async function submitReferralCode(
  code: string,
  accessToken?: string,
): Promise<ApiResponse<SubmitReferralResult>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  try {
    const response = await axios.post(
      `/api/referral/submit`,
      { referral_code: code },
      { headers },
    );

    if (!response.data?.success) {
      return {
        success: false,
        error:
          response.data?.error ||
          response.data?.message ||
          "Failed to submit referral code",
        status: response.status,
      };
    }

    return {
      success: true,
      data: response.data?.data || response.data,
    } as ApiResponse<SubmitReferralResult>;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        "Failed to submit referral code";
      return { success: false, error: message, status: error.response?.status };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get user's referral data (code, earnings, referral list)
 */
export async function getReferralData(
  accessToken: string,
  walletAddress?: string,
): Promise<ApiResponse<ReferralData>> {
  if (!accessToken) {
    return {
      success: false,
      error: "Authentication token is required",
    };
  }

  const url = walletAddress
    ? `/api/referral/referral-data?wallet_address=${encodeURIComponent(walletAddress)}`
    : `/api/referral/referral-data`;

  try {
    const response = await axios.get<ApiResponse<ReferralData>>(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.data?.success) {
      return {
        success: false,
        error: response.data?.error || "Failed to fetch referral data",
        status: response.status,
      };
    }

    return { success: true, data: response.data.data };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message =
        error.response?.data?.message ||
        error.message ||
        "Failed to fetch referral data";
      return {
        success: false,
        error: message,
        status: error.response?.status,
      };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

