import { arbitrum, base, polygon, lisk } from "viem/chains";
import {
  addRpcUrlOverrideToChain,
  type PrivyClientConfig,
} from "@privy-io/react-auth";
import { getRpcUrl } from "../utils";
import { customBsc } from "../mocks";

const bscOverride = addRpcUrlOverrideToChain(
  customBsc,
  getRpcUrl("BNB Smart Chain") ?? "https://bsc-dataseed.bnbchain.org/",
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
  supportedChains: [base, bscOverride, arbitrum, polygon, lisk],
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
