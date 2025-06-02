import { inAppWallet, createWallet } from "thirdweb/wallets";
import { customLightTheme, customDarkTheme } from "./theme";
import { THIRDWEB_CLIENT } from "./client";

// Wallet configuration
export const supportedWallets = [
  inAppWallet({
    auth: {
      options: ["google", "email", "passkey"],
    },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
  createWallet("io.rabby"),
  createWallet("io.zerion.wallet"),
];

// App metadata
export const appMetadata = {
  name: "Noblocks",
  url: "https://www.noblocks.xyz",
  description:
    "The first interface for decentralized payments to any bank or mobile wallet, powered by a distributed network of liquidity nodes.",
  logoUrl: "https://www.noblocks.xyz/favicon.ico",
} as const;

// Legal URLs
export const legalUrls = {
  privacyPolicyUrl: "https://www.noblocks.xyz/privacy-policy",
  termsOfServiceUrl: "https://www.noblocks.xyz/terms",
} as const;

// Connect modal configuration
export const getConnectConfig = (isDark: boolean) => ({
  client: THIRDWEB_CLIENT,
  ...legalUrls,
  size: "compact" as const,
  theme: isDark ? customDarkTheme : customLightTheme,
  appMetadata,
  title: "Log in or sign up",
  wallets: supportedWallets,
});
