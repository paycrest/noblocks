"use client";

import config from "@/app/lib/config";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { ReactNode } from "react";

const baseChain = {
  id: 8453,
  name: "Base Mainnet",
  network: "base",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.base.org"] },
    public: { http: ["https://mainnet.base.org"] },
  },
  blockExplorers: {
    default: { name: "BaseScan", url: "https://basescan.org" },
    baseScan: { name: "BaseScan", url: "https://basescan.org" },
  },
  contracts: {},
  testnet: false,
  blockTime: 12,
};

export function MiniKitContextProvider({ children }: { children: ReactNode }) {
  const { cdpApiKey, nodeEnv } = config;

  if (!cdpApiKey) {
    if (nodeEnv !== "production") {
      console.warn(
        "MiniKitContextProvider: NEXT_PUBLIC_CDP_API_KEY is not set. Rendering without MiniKitProvider.",
      );
    }
    return <>{children}</>;
  }

  return (
    <MiniKitProvider apiKey={cdpApiKey} chain={baseChain}>
      {children}
    </MiniKitProvider>
  );
}
