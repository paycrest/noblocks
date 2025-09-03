"use client";

import config from "@/app/lib/config";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { ReactNode } from "react";
import { base } from "wagmi/chains";

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
    <MiniKitProvider apiKey={cdpApiKey} chain={base}>
      {children}
    </MiniKitProvider>
  );
}
