// context/index.tsx
"use client";

import { wagmiAdapter, projectId, networks, bitcoinAdapter} from "./index";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit";
import { DefaultSIWX } from '@reown/appkit-siwx';

import React, { type ReactNode } from "react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useActualTheme } from "../hooks/useActualTheme";

// Set up queryClient
const queryClient = new QueryClient();

if (!projectId) {
  throw new Error("Project ID is not defined");
}

// Set up metadata
const metadata = {
  name: "noblock",
  description: "AppKit Example",
  url: "https://reown.com/appkit", // origin must match your domain & subdomain
  icons: ["https://assets.reown.com/reown-profile-pic.png"],
};

// Create the modal
const modal = createAppKit({
  adapters: [wagmiAdapter, bitcoinAdapter],
  projectId,
  networks,
  metadata: metadata,
  features: {
    analytics: true, // Optional - defaults to your Cloud configuration
  },
  siwx: new DefaultSIWX(),
});

function ContextProvider({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  const isDark = useActualTheme();
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies,
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <WagmiProvider
        config={wagmiAdapter.wagmiConfig as Config}
        initialState={initialState}
      >
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster position="bottom-right" theme={isDark ? "dark" : "light"} />
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}

export default ContextProvider;
