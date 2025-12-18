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
  sentryDsn: process.env.SENTRY_DSN || "",
  nodeEnv: process.env.NODE_ENV || "",
  sentryUrl: process.env.SENTRY_URL || "",
  sentryAuthToken: process.env.SENTRY_AUTH_TOKEN || "",
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

// Sanitize Sanity projectId to only contain valid characters (a-z, 0-9, dashes)
function sanitizeProjectId(projectId: string): string {
  if (!projectId) return "";
  // Convert to lowercase, replace underscores and other invalid chars with dashes
  // Remove any characters that aren't lowercase letters, numbers, or dashes
  return projectId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-") // Replace multiple dashes with single dash
    .replace(/^-|-$/g, ""); // Remove leading/trailing dashes
}

// Check if projectId is a placeholder or invalid
function isValidProjectId(projectId: string): boolean {
  if (!projectId) return false;
  // Check for common placeholder patterns
  const placeholderPatterns = [
    /^your-project-id/i,
    /^placeholder/i,
    /^example/i,
    /^test-project/i,
    /^change-me/i,
    /^replace/i,
  ];
  return !placeholderPatterns.some((pattern) => pattern.test(projectId));
}

// Sanity-specific configuration for client-side (Next.js app)
const rawProjectId = sanitizeProjectId(process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "");
export const clientConfig = {
  projectId: isValidProjectId(rawProjectId) ? rawProjectId : "",
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "",
  apiVersion: "2024-01-01", // Pin to a stable date
  useCdn: process.env.NODE_ENV === "production", // Use CDN in production for better performance
};

// Sanity-specific configuration for server-side (Sanity Studio)
export const serverConfig = {
  projectId: sanitizeProjectId(process.env.SANITY_STUDIO_PROJECT_ID || ""),
  dataset: process.env.SANITY_STUDIO_DATASET || "",
  apiVersion: "2024-01-01", // Pin to a stable date
  useCdn: false, // Set to false for fresh data
};
