import {
  arbitrum,
  base,
  bsc,
  polygon,
  lisk,
  celo,
  scroll,
  mainnet,
} from "viem/chains";
import {
  addRpcUrlOverrideToChain,
  type PrivyClientConfig,
} from "@privy-io/react-auth";
import { getRpcUrl } from "../utils";

const bscOverride = addRpcUrlOverrideToChain(
  bsc,
  getRpcUrl(bsc.name) ?? "https://bsc-dataseed.bnbchain.org/",
);

const celoOverride = addRpcUrlOverrideToChain(
  celo,
  getRpcUrl(celo.name) ?? "https://forno.celo.org",
);

const scrollOverride = addRpcUrlOverrideToChain(
  scroll,
  getRpcUrl(scroll.name) ?? "https://rpc.scroll.io",
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
  supportedChains: [
    mainnet,
    base,
    bscOverride,
    arbitrum,
    polygon,
    lisk,
    celoOverride,
    scrollOverride,
  ],
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
