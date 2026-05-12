import axios from "axios";
import type {
  RatePayload,
  RateResponse,
  RateSide,
  V2RateQuoteResponse,
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
} from "../types";
import {
  trackServerEvent,
  trackBusinessEvent,
  trackApiRequest,
  trackApiResponse,
} from "../lib/server-analytics";
import config from "../lib/config";

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

/** Base URL without trailing `/v1` so v2 paths are `{origin}/v2/...` not `{origin}/v1/v2/...`. */
function aggregatorOriginForV2(): string {
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
      error_message: error instanceof Error ? error.message : "Unknown error",
      response_time_ms: responseTime,
    });

    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      throw new Error(message);
    }
    console.error("Error fetching rate:", error);
    throw error;
  }
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
export const fetchAggregatorPublicKey = async (): Promise<PubkeyResponse> => {
  try {
    const response = await axios.get(`${AGGREGATOR_URL}/pubkey`);
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
 * Fetches details of an order by chain ID and order ID
 * @param {number} chainId - The blockchain chain ID
 * @param {string} orderId - The order ID
 * @returns {Promise<OrderDetailsResponse>} The order details
 * @throws {Error} If the API request fails
 */
export const fetchOrderDetails = async (
  chainId: number,
  orderId: string,
): Promise<OrderDetailsResponse> => {
  try {
    const response = await axios.get(
      `${AGGREGATOR_URL}/orders/${chainId}/${orderId}`,
    );
    return response.data;
  } catch (error) {
    throw error;
  }
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
 * @returns {Promise<TransactionResponse>} The transactions response
 * @throws {Error} If the API request fails
 */
export async function fetchTransactions(
  address: string,
  accessToken: string,
  page: number = 1,
  limit: number = 20,
): Promise<TransactionResponse> {
  const response = await axios.get<TransactionResponse>(
    `/api/v1/transactions?page=${page}&limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-wallet-address": address.toLowerCase(),
      },
    },
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
  accessToken: string,
): Promise<SaveTransactionResponse> {
  const response = await axios.post("/api/v1/transactions", transaction, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      // Same intent as middleware primary wallet; overwritten by middleware for browser,
      // but clarifies signer for proxies and matches fetchTransactions/update patterns.
      "x-wallet-address": String(transaction.walletAddress).toLowerCase(),
    },
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
> & { recipient?: TransactionCreateInput["recipient"] };

/**
 * Server-side monthly KYC limit check (RPC dry run) before on-chain swap steps.
 * Throws Error with the API message when the swap would be rejected at save time.
 */
export async function precheckSwapTransaction(
  payload: SwapPrecheckPayload,
  accessToken: string,
): Promise<void> {
  const res = await axios.post<{ success?: boolean; error?: string }>(
    "/api/v1/transactions/swap-precheck",
    payload,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-wallet-address": String(payload.walletAddress).toLowerCase(),
      },
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
export async function updateTransactionStatus({
  transactionId,
  status,
  accessToken,
  walletAddress,
}: UpdateTransactionStatusPayload): Promise<SaveTransactionResponse> {
  const finalStatus = mapAggregatorStatusToDbStatus(status, { onramp: false });

  const response = await axios.put(
    `/api/v1/transactions/status/${transactionId}`,
    { status: finalStatus },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-wallet-address": walletAddress.toLowerCase(),
      },
    },
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

  const response = await axios.put(
    `/api/v1/transactions/${transactionId}`,
    data,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-wallet-address": walletAddress.toLowerCase(),
      },
    },
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

/**
 * Fetches the list of supported tokens from the aggregator API
 * @returns {Promise<APIToken[]>} Array of supported tokens from the API
 * @throws {Error} If the API request fails
 */
export const fetchTokens = async (): Promise<APIToken[]> => {
  try {
    const response = await axios.get(`${AGGREGATOR_URL}/tokens`);
    if (response.data?.data && Array.isArray(response.data.data)) {
      return response.data.data;
    }
    return [];
  } catch (error) {
    console.error("Error fetching supported tokens from API:", error);
    throw error;
  }
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
 * Loads the saved refund account for the authenticated wallet, if any.
 */
export async function fetchRefundAccount(
  accessToken: string,
): Promise<RefundAccountDetails | null> {
  const response = await axios.get<RefundAccountApiEnvelope>(
    "/api/v1/refund-account",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.data.success) {
    throw new Error(response.data.error || "Failed to load refund account");
  }

  return response.data.data;
}

/**
 * Upserts refund account details for the authenticated wallet.
 */
export async function saveRefundAccount(
  detail: RefundAccountDetails,
  accessToken: string,
): Promise<RefundAccountDetails> {
  const response = await axios.put<RefundAccountSaveEnvelope>(
    "/api/v1/refund-account",
    {
      institution: detail.institutionName,
      institutionCode: detail.institutionCode,
      accountIdentifier: detail.accountNumber,
      accountName: detail.accountName,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

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
 * @returns {Promise<SmileIDSubmissionResponse>} The submission response
 * @throws {Error} If the API request fails
 */
export const submitSmileIDData = async (
  payload: any,
  accessToken: string,
): Promise<SmileIDSubmissionResponse> => {
  const startTime = Date.now();

  try {
    // Track external API request (log metadata only, no PII)
    trackServerEvent("External API Request", {
      service: "next-api",
      endpoint: "/api/kyc/smile-id",
      method: "POST",
    });

    // Call Next.js API route with JWT authentication
    const response = await axios.post(`/api/kyc/smile-id`, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
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
 */
export async function createV2SenderPaymentOrder(
  payload: V2CreatePaymentOrderPayload,
  accessToken: string,
): Promise<AggregatorEnvelope<V2PaymentOrderCreateData>> {
  const response = await axios.post<AggregatorEnvelope<V2PaymentOrderCreateData>>(
    "/api/v1/payment-orders",
    payload,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
  return response.data;
}

/**
 * Fetches a single v2 sender order (e.g. to refresh fiat virtual account details).
 */
export async function fetchV2SenderPaymentOrderById(
  orderId: string,
  accessToken: string,
): Promise<AggregatorEnvelope<V2PaymentOrderGetData>> {
  const response = await axios.get<AggregatorEnvelope<V2PaymentOrderGetData>>(
    `/api/v1/payment-orders/${encodeURIComponent(orderId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  return response.data;
}
