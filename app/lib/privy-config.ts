import {
  arbitrum,
  base,
  bsc,
  polygon,
  lisk,
  celo,
  mainnet,
} from "viem/chains";
import {
  addRpcUrlOverrideToChain,
  dataSuffix,
  type PrivyClientConfig,
} from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
} from "@solana/kit";
import { getRpcUrl } from "../utils";
import { BASE_BUILDER_CODE_SUFFIX } from "./baseBuilderCode";
import config from "./config";

const bscOverride = addRpcUrlOverrideToChain(
  bsc,
  getRpcUrl(bsc.name) ?? "https://bsc-dataseed.bnbchain.org/",
);

const celoOverride = addRpcUrlOverrideToChain(
  celo,
  getRpcUrl(celo.name) ?? "https://forno.celo.org",
);

const solanaPrivyConfig = config.solanaEnabled
  ? {
      embeddedWallets: {
        ethereum: {
          createOnLogin: "all-users" as const,
        },
        solana: {
          createOnLogin: "all-users" as const,
        },
      },
      externalWallets: {
        coinbaseWallet: {
          config: {
            preference: {
              options: "smartWalletOnly" as const,
            },
          },
        },
        solana: {
          connectors: toSolanaWalletConnectors(),
        },
      },
      solana: {
        rpcs: {
          "solana:devnet": {
            rpc: createSolanaRpc(config.solanaDevnetRpc),
            rpcSubscriptions: createSolanaRpcSubscriptions(
              config.solanaDevnetWss,
            ),
          },
        },
      },
    }
  : {
      embeddedWallets: {
        ethereum: {
          createOnLogin: "all-users" as const,
        },
      },
      externalWallets: {
        coinbaseWallet: {
          config: {
            preference: {
              options: "smartWalletOnly" as const,
            },
          },
        },
      },
    };

const baseConfig: Omit<PrivyClientConfig, "appearance"> = {
  ...solanaPrivyConfig,
  supportedChains: [
    mainnet,
    base,
    bscOverride,
    arbitrum,
    polygon,
    lisk,
    celoOverride,
  ],
  plugins: [dataSuffix(BASE_BUILDER_CODE_SUFFIX)],
};

const solanaAppearance = config.solanaEnabled
  ? { walletChainType: "ethereum-and-solana" as const }
  : {};

export const lightModeConfig: PrivyClientConfig = {
  ...baseConfig,
  appearance: {
    theme: "#FFFFFF",
    accentColor: "#8B85F4",
    landingHeader: "Log in or sign up",
    logo: "/logos/noblocks-logo.svg",
    ...solanaAppearance,
  },
};

export const darkModeConfig: PrivyClientConfig = {
  ...baseConfig,
  appearance: {
    theme: "#202020",
    accentColor: "#8B85F4",
    landingHeader: "Log in or sign up",
    logo: "/logos/noblocks-logo.svg",
    ...solanaAppearance,
  },
};
