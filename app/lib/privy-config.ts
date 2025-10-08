import { arbitrum, base, bsc, polygon, lisk } from "viem/chains";
import {
  addRpcUrlOverrideToChain,
  type PrivyClientConfig,
} from "@privy-io/react-auth";
import { getRpcUrl } from "../utils";

const bscOverride = addRpcUrlOverrideToChain(
  bsc,
  getRpcUrl(bsc.name) ?? "https://bsc-dataseed.bnbchain.org/",
);

const baseConfig: Omit<PrivyClientConfig, "appearance"> = {
  embeddedWallets: {
    ethereum: {
      createOnLogin: "all-users",
    },
  },
  externalWallets: {
    coinbaseWallet: {
      config: {
        preference: {
          options: "smartWalletOnly",
        },
      },
    },
  },
  supportedChains: [base, bscOverride, arbitrum, polygon, lisk],
};

export const lightModeConfig: PrivyClientConfig = {
  ...baseConfig,
  appearance: {
    theme: "#FFFFFF",
    accentColor: "#8B85F4",
    landingHeader: "Log in or sign up",
    logo: "/logos/noblocks-logo.svg",
  },
};

export const darkModeConfig: PrivyClientConfig = {
  ...baseConfig,
  appearance: {
    theme: "#202020",
    accentColor: "#8B85F4",
    landingHeader: "Log in or sign up",
    logo: "/logos/noblocks-logo.svg",
  },
};
