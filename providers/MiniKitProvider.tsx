"use client";

import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { ReactNode } from "react";
import { base } from "wagmi/chains";

export function MiniKitContextProvider({ children }: { children: ReactNode }) {
  // return (
  //   <MiniKitProvider
  //     apiKey={process.env.NEXT_PUBLIC_CDP_CLIENT_API_KEY}
  //     chain={base}
  //   >
  //     {children}
  //   </MiniKitProvider>
  // );

  const apiKey = process.env.NEXT_PUBLIC_CDP_CLIENT_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "MiniKitContextProvider: NEXT_PUBLIC_CDP_CLIENT_API_KEY is not set. Rendering without MiniKitProvider.",
      );
    }
    return <>{children}</>;
  }
  return (
    <MiniKitProvider apiKey={apiKey} chain={base}>
      {children}
    </MiniKitProvider>
  );
}
