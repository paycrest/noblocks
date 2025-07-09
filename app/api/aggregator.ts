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
} from "../types";

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
  try {
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

    // Check the API response status first
    if (data.status === "error") {
      throw new Error(data.message || "Provider not found");
    }

    return data;
  } catch (error) {
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
  try {
    const response = await axios.post(
      `${AGGREGATOR_URL}/verify-account`,
      payload,
    );
    return response.data.data;
  } catch (error) {
    console.error("Error fetching supported institutions:", error);
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
  try {
    const response = await axios.post(`${AGGREGATOR_URL}/kyc`, payload);
    return response.data;
  } catch (error) {
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
  try {
    const response = await axios.get(`${AGGREGATOR_URL}/kyc/${walletAddress}`);
    return response.data;
  } catch (error) {
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
