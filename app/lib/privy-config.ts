import { arbitrum, base, bsc, optimism, polygon, scroll } from "viem/chains";
import type { PrivyClientConfig } from "@privy-io/react-auth";

const baseConfig: Omit<PrivyClientConfig, 'appearance'> = {
  embeddedWallets: {
    createOnLogin: "all-users",
  },
  externalWallets: {
    coinbaseWallet: {
      connectionOptions: "smartWalletOnly",
    },
  },
  supportedChains: [base, bsc, arbitrum, polygon, scroll, optimism],
};

export const lightModeConfig: PrivyClientConfig = {
  ...baseConfig,
  appearance: {
    theme: "light",
    accentColor: "#8B85F4",
    landingHeader: "Log in or sign up",
    logo: "/logos/noblocks-logo.svg",
  },
};

export const darkModeConfig: PrivyClientConfig = {
  ...baseConfig,
  appearance: {
    theme: "dark",
    accentColor: "#8B85F4",
    landingHeader: "Log in or sign up",
    logo: "/logos/noblocks-logo.svg",
  },
};
