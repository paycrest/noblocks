import { arbitrum, base, bsc, polygon, lisk, mainnet } from "viem/chains";
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
    createOnLogin: "all-users",
  },
  externalWallets: {
    coinbaseWallet: {
      connectionOptions: "smartWalletOnly",
    },
  },
  supportedChains: [mainnet, base, bscOverride, arbitrum, polygon, lisk],
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
