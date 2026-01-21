import axios from "axios";
import type {
  RatePayload,
  RateResponse,
  InstitutionProps,
  PubkeyResponse,
  VerifyAccountPayload,
  InitiateKYCPayload,
  InitiateKYCResponse,
  KYCStatusResponse,
  OrderDetailsResponse,
  TransactionResponse,
  TransactionCreateInput,
  SaveTransactionResponse,
  UpdateTransactionDetailsPayload,
  UpdateTransactionStatusPayload,
  APIToken,
  RecipientDetails,
  RecipientDetailsWithId,
  SavedRecipientsResponse,
  ReferralData,
  ApiResponse,
  SubmitReferralResult,
} from "../types";
import {
  trackServerEvent,
  trackBusinessEvent,
  trackApiRequest,
  trackApiResponse,
} from "../lib/server-analytics";

const AGGREGATOR_URL = process.env.NEXT_PUBLIC_AGGREGATOR_URL;

/**
 * Fetches the current exchange rate for a given token and currency pair
 * @param {RatePayload} params - The rate request parameters
 * @param {string} params.token - The token symbol
 * @param {number} [params.amount=1] - The amount to convert
 * @param {string} params.currency - The target currency
 * @param {string} [params.providerId] - Optional provider ID
 * @param {string} [params.network] - Optional network identifier (e.g., "arbitrum-one", "polygon")
 * @returns {Promise<RateResponse>} The rate response containing exchange rate and fees
 * @throws {Error} If the API request fails or returns an error
 */
export const fetchRate = async ({
  token,
  amount = 1,
  currency,
  providerId,
  network,
}: RatePayload): Promise<RateResponse> => {
  const startTime = Date.now();

  try {
    // Track external API request
    trackServerEvent("External API Request", {
      service: "aggregator",
      endpoint: "/rates",
      method: "GET",
      token,
      amount,
      currency,
      provider_id: providerId,
      network,
    });

    const endpoint = `${AGGREGATOR_URL}/rates/${token}/${amount}/${currency}`;
    const params: Record<string, string> = {};

    if (providerId) {
      params.provider_id = providerId;
    }
    if (network) {
      params.network = network;
    }

    const response = await axios.get(endpoint, { params });
    const { data } = response;

    // Track successful response
    const responseTime = Date.now() - startTime;
    trackApiResponse("/rates", "GET", 200, responseTime, {
      service: "aggregator",
      token,
      amount,
      currency,
      provider_id: providerId,
      network,
      rate: data.data,
    });

    // Track business event
    trackBusinessEvent("Rate Fetched", {
      token,
      amount,
      currency,
      provider_id: providerId,
      network,
      rate: data.data,
    });

    // Check the API response status first
    if (data.status === "error") {
      throw new Error(data.message || "Provider not found");
    }

    return data;
  } catch (error) {
    const responseTime = Date.now() - startTime;

    // Track API error
    trackServerEvent("External API Error", {
      service: "aggregator",
      endpoint: "/rates",
      method: "GET",
      token,
      amount,
      currency,
      provider_id: providerId,
      network,
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
    },
  });
  return response.data;
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
  const finalStatus = ["validated", "settled"].includes(status)
    ? "completed"
    : status;

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
}: UpdateTransactionDetailsPayload): Promise<SaveTransactionResponse> {
  const finalStatus = ["validated", "settled"].includes(status)
    ? "completed"
    : status;

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
    const response = await axios.post(`/api/referral/submit`, { referral_code: code }, { headers });

    if (!response.data?.success) {
      return { success: false, error: response.data?.error || response.data?.message || "Failed to submit referral code", status: response.status };
    }

    return { success: true, data: response.data?.data || response.data } as ApiResponse<SubmitReferralResult>;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message || "Failed to submit referral code";
      return { success: false, error: message, status: error.response?.status };
    }
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
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

    // The endpoint auto-generates code if missing, so data.referral_code should always exist
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

/**
 * Fetches saved recipients for a wallet address
 * @param {string} accessToken - The access token for authentication
 * @returns {Promise<RecipientDetailsWithId[]>} Array of saved recipients
 * @throws {Error} If the API request fails
 */
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
      existingRecipients.map(
        (r) => `${r.institutionCode}-${r.accountIdentifier}`,
      ),
    );

    // Filter out duplicates - only migrate recipients that don't exist in DB
    const recipientsToMigrate = recipients.filter((recipient) => {
      const key = `${recipient.institutionCode}-${recipient.accountIdentifier}`;
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
        console.error(`Failed to migrate recipient ${recipient.name}:`, error);
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
}
