import axios from "axios";
import type {
  RatePayload,
  RateResponse,
  InstitutionProps,
  PubkeyResponse,
  VerifyAccountPayload,
  OrderStatusResponse,
  InitiateKYCPayload,
  InitiateKYCResponse,
  KYCStatusResponse,
} from "../types";

const AGGREGATOR_URL = process.env.NEXT_PUBLIC_AGGREGATOR_URL;
const PROVIDER_ID = process.env.NEXT_PUBLIC_PROVIDER_ID;

export const fetchRate = async ({
  token,
  amount,
  currency,
}: RatePayload): Promise<RateResponse> => {
  try {
    const response = await axios.get(
      `${AGGREGATOR_URL}/rates/${token}/${amount}/${currency}?provider_id=${PROVIDER_ID}`,
    );
    return response.data;
  } catch (error) {
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

export const fetchOrderStatus = async (
  orderId: string,
): Promise<OrderStatusResponse> => {
  try {
    const response = await axios.get(`${AGGREGATOR_URL}/orders/${orderId}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching order status:", error);
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
    console.error("Error initiating KYC:", error);
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
    console.error("Error fetching KYC status:", error);
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
