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
  Transaction,
  TransactionResponse,
  TransactionCreateInput,
} from "../types";

const AGGREGATOR_URL = process.env.NEXT_PUBLIC_AGGREGATOR_URL;

export const fetchRate = async ({
  token,
  amount = 1,
  currency,
  providerId,
}: RatePayload): Promise<RateResponse> => {
  try {
    const endpoint = `${AGGREGATOR_URL}/rates/${token}/${amount}/${currency}`;
    const params = providerId ? { provider_id: providerId } : undefined;

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

export const fetchAggregatorPublicKey = async (): Promise<PubkeyResponse> => {
  try {
    const response = await axios.get(`${AGGREGATOR_URL}/pubkey`);
    return response.data;
  } catch (error) {
    console.error("Error fetching aggregator public key:", error);
    throw error;
  }
};

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

export const detectUserLocation = async (): Promise<string> => {
  try {
    const response = await axios.get("https://ipapi.co/json/");
    return response.data.country_code;
  } catch (error) {
    console.error("Error detecting user location:", error);
    return "";
  }
};

export async function fetchTransactions(
  address: string,
  accessToken: string,
  page: number = 1,
  limit: number = 20,
) {
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

export async function saveTransaction(
  transaction: TransactionCreateInput,
  accessToken: string,
) {
  const response = await axios.post<{ success: boolean; error?: string }>(
    "/api/v1/transactions",
    transaction,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  return response.data;
}
