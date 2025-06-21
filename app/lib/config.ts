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
