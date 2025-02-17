// context/index.tsx
"use client";

import { wagmiAdapter, projectId, networks, bitcoinAdapter} from "./index";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { DefaultSIWX } from '@reown/appkit-siwx';

import React, { type ReactNode } from "react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { useActualTheme } from "../hooks/useActualTheme";

import { StepProvider } from "../context";
import { mainnet } from "@reown/appkit/networks";
// Set up queryClient
export const queryClient = new QueryClient();

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
createAppKit({
  adapters: [wagmiAdapter, bitcoinAdapter],
  projectId,
  networks,
  metadata: metadata,
  defaultNetwork: mainnet,
  features: {
    // analytics: true, // Optional - defaults to your Cloud configuration
    email: true, // default to true
    socials: ["google", "x", "github", "discord", "apple", "facebook"],
    emailShowWallets: true, // default to true
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
        <StepProvider>
          <QueryClientProvider client={queryClient}>
            {children}
            <Toaster position="bottom-right" theme={isDark ? "dark" : "light"} />
          </QueryClientProvider>
        </StepProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}

export default ContextProvider;
