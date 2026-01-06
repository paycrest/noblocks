import { Config, JWTProviderConfig } from "@/app/types";

const config: Config = {
  aggregatorUrl: process.env.NEXT_PUBLIC_AGGREGATOR_URL || "",
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "",
  thirdwebClientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
  mixpanelToken: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || "",
  hotjarSiteId: Number(process.env.NEXT_PUBLIC_HOTJAR_SITE_ID || ""),
  googleVerificationCode:
    process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION_CODE || "",
  noticeBannerText: process.env.NEXT_PUBLIC_NOTICE_BANNER_TEXT || "",
  brevoConversationsId: process.env.NEXT_PUBLIC_BREVO_CONVERSATIONS_ID || "",
  brevoConversationsGroupId: process.env.NEXT_PUBLIC_BREVO_CONVERSATIONS_GROUP_ID || "",
  blockfestEndDate:
    process.env.NEXT_PUBLIC_BLOCKFEST_END_DATE || "2025-10-11T23:59:00+01:00",
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

//  Parse Sentry DSN to extract components
function parseDSN(dsn: string): { publicKey: string; serverUrl: string; projectId: string } | null {
  try {
    const match = dsn.match(/^https:\/\/([^@]+)@([^\/]+)\/(\d+)$/);
    if (match) {
      return {
        publicKey: match[1],
        serverUrl: `https://${match[2]}`,
        projectId: match[3],
      };
    }
  } catch {
    // Invalid DSN format
  }
  return null;
}

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || "";
const sentryUrl = process.env.NEXT_PUBLIC_SENTRY_URL || "";
const dsnParts = sentryDsn ? parseDSN(sentryDsn) : null;

// Validate DSN parsing
if (sentryDsn && !dsnParts) {
  console.warn("[Sentry Config] Failed to parse DSN:", sentryDsn);
}

export const sentryConfig = {
  serverUrl: dsnParts?.serverUrl || sentryUrl,
  projectId: dsnParts?.projectId,
  publicKey: dsnParts?.publicKey,
  enabled: true,
  sampleRate: 1.0,
  environment: process.env.NODE_ENV || "development",
  release: "2.0.0",
};