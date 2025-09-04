"use client";

import config from "@/app/lib/config";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { ReactNode } from "react";

// Define the Base chain object inline or in a separate file
const baseChain = {
  id: 8453,
  name: "Base Mainnet",
  network: "base",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: ["https://mainnet.base.org"],
  },
  blockExplorers: {
    default: { name: "BaseScan", url: "https://basescan.org" },
    baseScan: { name: "BaseScan", url: "https://basescan.org" },
  },
  contracts: {}, // optional
  testnet: false, // optional
  blockTime: 12, // optional
};

export function MiniKitContextProvider({ children }: { children: ReactNode }) {
  const { cdpApiKey, nodeEnv } = config;

  if (!cdpApiKey) {
    if (nodeEnv !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "MiniKitContextProvider: NEXT_PUBLIC_CDP_API_KEY is not set. Rendering without MiniKitProvider.",
      );
    }
    return <>{children}</>;
  }

  return (
    // @ts-expect-error: ignoring type mismatch for chain
    <MiniKitProvider apiKey={cdpApiKey} chain={baseChain}>
      {children}
    </MiniKitProvider>
  );
}
