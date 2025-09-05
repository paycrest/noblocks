import { Config, JWTProviderConfig } from "@/app/types";

const config: Config = {
  aggregatorUrl: process.env.NEXT_PUBLIC_AGGREGATOR_URL || "",
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "",
  thirdwebClientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "",
  mixpanelToken: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || "",
  hotjarSiteId: Number(process.env.NEXT_PUBLIC_HOTJAR_SITE_ID || ""),
  contactSupportUrl: process.env.NEXT_PUBLIC_CONTACT_SUPPORT_URL || "",
  googleVerificationCode:
    process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION_CODE || "",
  noticeBannerText: process.env.NEXT_PUBLIC_NOTICE_BANNER_TEXT || "",
  cdpApiKey: process.env.NEXT_PUBLIC_CDP_API_KEY || "",
  appUrl: process.env.NEXT_PUBLIC_URL || "https://noblocks.xyz",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  farcasterHeader: process.env.FARCASTER_HEADER || "",
  farcasterPayload: process.env.FARCASTER_PAYLOAD || "",
  farcasterSignatuure: process.env.FARCASTER_SIGNATURE || "",
  publicUrl: process.env.NEXT_PUBLIC_URL || "",
  onchainKitProjectName: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME || "",
  appSubstitle: process.env.NEXT_PUBLIC_APP_SUBTITLE || "",
  appDescription: process.env.NEXT_PUBLIC_APP_DESCRIPTION || "",
  appIcon:
    process.env.NEXT_PUBLIC_APP_ICON ||
    "https://noblocks-ialc.vercel.app/icons/android-chrome-192x192.png",
  appSpashImage:
    process.env.NEXT_PUBLIC_APP_SPLASH_IMAGE ||
    "https://noblocks-ialc.vercel.app/screenshots/desktop-wide.png",
  splashBackgroundColor: process.env.NEXT_PUBLIC_SPLASH_BACKGROUND_COLOR || "",
  appPrimaryCategory: process.env.NEXT_PUBLIC_APP_PRIMARY_CATEGORY || "",
  appHeroImage:
    process.env.NEXT_PUBLIC_APP_HERO_IMAGE ||
    "https://noblocks-ialc.vercel.app/screenshots/desktop-wide.png",
  appTagline:
    process.env.NEXT_PUBLIC_APP_TAGLINE || "Stablecoin payments made easy.",
  appOgTitle:
    process.env.NEXT_PUBLIC_APP_OG_TITLE || "Noblocks – Stablecoin mini app",
  appOgDescription:
    process.env.NEXT_PUBLIC_APP_OG_DESCRIPTION ||
    "Send & receive stablecoins on Base without leaving Warpcast.",
  publicAppOGImage:
    process.env.NEXT_PUBLIC_APP_OG_IMAGE ||
    "https://noblocks-ialc.vercel.app/og-preview.png",
  noIndex: process.env.NEXT_PUBLIC_NOINDEX || "",
  nodeEnv: process.env.NODE_ENV || "",
};

export default config;

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
