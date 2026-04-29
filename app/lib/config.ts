import { Config, JWTProviderConfig } from "@/app/types";

/** EIP-7702 delegation contract (ProviderBatchCallAndSponsor) per chain. */
export const DELEGATION_CONTRACT_BY_CHAIN: Record<number, string> = {
  42220: "0x847dfdAa218F9137229CF8424378871A1DA8f625",
  8453: "0xDb61aF57A7fD133C54F51ae4d95469af9F846F6e",
  42161: "0x59288AC5c262B71b631Be6742967261526E00d59",
  56: "0x59288AC5c262B71b631Be6742967261526E00d59",
  137: "0x97b4e402db6DB09F067B6E085B84c95176499d16",
  1135: "0x0a7aA9F8eab1665DD905288669447b66082E4B17",
  1: "0x25054a2b9D4544ed292DC1a74E8bF1f6F449d988",
};

/** Returns the delegation contract address for the given chainId. Uses NEXT_PUBLIC_DELEGATION_CONTRACT_ADDRESS if set, else DELEGATION_CONTRACT_BY_CHAIN, else "". */
export function getDelegationContractAddress(chainId: number): string {
  return DELEGATION_CONTRACT_BY_CHAIN[chainId] ?? "";
}

export const STARKNET_READY_ACCOUNT_CLASSHASH = "0x073414441639dcd11d1846f287650a00c60c416b9d3ba45d31c651672125b2c2";

export const STARKNET_PAYMASTER_URL = "https://starknet.paymaster.avnu.fi";

export const STARKNET_PAYMASTER_MODE = "sponsored";

const config: Config = {
  aggregatorUrl: process.env.NEXT_PUBLIC_AGGREGATOR_URL || "",
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "",
  rpcUrlKey: process.env.NEXT_PUBLIC_RPC_URL_KEY || "",
  mixpanelToken: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || "",
  hotjarSiteId: Number(process.env.NEXT_PUBLIC_HOTJAR_SITE_ID || ""),
  googleVerificationCode:
    process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION_CODE || "",
  noticeBannerText: process.env.NEXT_PUBLIC_NOTICE_BANNER_TEXT || "",
  brevoConversationsId: process.env.NEXT_PUBLIC_BREVO_CONVERSATIONS_ID || "",
  brevoConversationsGroupId: process.env.NEXT_PUBLIC_BREVO_CONVERSATIONS_GROUP_ID || "",
  blockfestEndDate:
    process.env.NEXT_PUBLIC_BLOCKFEST_END_DATE || "2025-10-11T23:59:00+01:00",
  /** @deprecated Use delegationContractAddress. Kept for backward compatibility. */
  // biconomyNexusV120:
  //   process.env.NEXT_PUBLIC_BICONOMY_NEXUS_V120 || "0x000000004f43c49e93c970e84001853a70923b03",
  /** MEE API key for Biconomy Supertransaction API (sponsored execution). Replaces deprecated paymaster. */
  biconomyMeeApiKey:
    process.env.NEXT_PUBLIC_BICONOMY_MEE_API_KEY ||
    "",
  /** Base URL of the Biconomy v2→Nexus upgrade server (mini bundler). e.g. http://localhost:3000 when running locally. */
  bundlerServerUrl:
    process.env.NEXT_PUBLIC_BUNDLER_SERVER_URL || "",
  maintenanceEnabled:
    process.env.NEXT_PUBLIC_MAINTENANCE_NOTICE_ENABLED === "true" &&
    !!(process.env.NEXT_PUBLIC_MAINTENANCE_SCHEDULE || "").trim(),
  maintenanceSchedule:
    process.env.NEXT_PUBLIC_MAINTENANCE_SCHEDULE || "",
  referralMinQualifyingVolumeUsd: (() => {
    const parsed = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_MIN_QUALIFYING_VOLUME_USD ?? "");
    return Number.isFinite(parsed) ? parsed : 0;
  })(),
  referralRewardAmountUsd: (() => {
    const parsed = parseFloat(process.env.NEXT_PUBLIC_REFERRAL_REWARD_AMOUNT_USD ?? "");
    return Number.isFinite(parsed) ? parsed : 0;
  })(),
  /** Sender API key UUID (aggregator dashboard). Used by server proxy and client (on-chain messageHash metadata). */
  aggregatorSenderApiKey: (process.env.NEXT_PUBLIC_AGGREGATOR_SENDER_API_KEY_ID || "").trim(),
};

export default config;

// Fee recipient address for sender fees (required)
const feeRecipientAddressEnv = process.env.NEXT_PUBLIC_FEE_RECIPIENT_ADDRESS;
if (!feeRecipientAddressEnv) {
  throw new Error(
    "Missing required environment variable: NEXT_PUBLIC_FEE_RECIPIENT_ADDRESS",
  );
}
export const feeRecipientAddress: string = feeRecipientAddressEnv;

// Local transfer fee (e.g. cNGN -> NGN): percentage and cap in human-readable units
const parsedFeePercent = parseFloat(process.env.NEXT_PUBLIC_LOCAL_TRANSFER_FEE_PERCENT ?? "");
export const localTransferFeePercent: number = Number.isFinite(parsedFeePercent)
  ? parsedFeePercent
  : 0.3;

const parsedFeeCap = parseFloat(process.env.NEXT_PUBLIC_LOCAL_TRANSFER_FEE_CAP ?? "");
export const localTransferFeeCap: number =
  Number.isFinite(parsedFeeCap) && Number.isInteger(parsedFeeCap)
    ? parsedFeeCap
    : 10000;

export const DEFAULT_PRIVY_CONFIG: JWTProviderConfig = {
  provider: "privy",
  privy: {
    jwksUrl: process.env.PRIVY_JWKS_URL || "",
    issuer: process.env.PRIVY_ISSUER || "",
    algorithms: ["ES256"],
  },
};

export const DEFAULT_THIRDWEB_CONFIG: JWTProviderConfig = {
  provider: "thirdweb",
  thirdweb: {
    clientId: process.env.THIRDWEB_CLIENT_ID || "",
    domain: process.env.THIRDWEB_DOMAIN || "",
  },
};

// Sanity-specific configuration for client-side (Next.js app)
export const clientConfig = {
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "",
  apiVersion: "2024-01-01", // Pin to a stable date
  useCdn: process.env.NODE_ENV === "production", // Use CDN in production for better performance
};

// Sanity-specific configuration for server-side (Sanity Studio)
export const serverConfig = {
  projectId: process.env.SANITY_STUDIO_PROJECT_ID || "",
  dataset: process.env.SANITY_STUDIO_DATASET || "",
  apiVersion: "2024-01-01", // Pin to a stable date
  useCdn: false, // Set to false for fresh data
};
