"use client";
import { Toaster } from "sonner";
import { type ReactNode } from "react";
import { ThemeProvider } from "next-themes";

import {
  arbitrum,
  base,
  bsc,
  mainnet,
  optimism,
  polygon,
  scroll,
} from "viem/chains";
import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { createConfig, http, WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

import config from "./lib/config";
import { NetworkProvider, StepProvider } from "./context";

function Providers({ children }: { children: ReactNode }) {
  const { privyAppId } = config;

  const wagmiConfig = createConfig({
    chains: [mainnet],
    transports: {
      [mainnet.id]: http(),
    },
  });

  const queryClient = new QueryClient();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <PrivyProvider
            appId={privyAppId}
            config={{
              appearance: {
                theme: "dark",
                accentColor: "#8B85F4",
                landingHeader: "Connect",
                logo: "/logos/noblocks-logo.svg",
              },
              embeddedWallets: {
                createOnLogin: "all-users",
              },
              externalWallets: {
                coinbaseWallet: {
                  connectionOptions: "smartWalletOnly",
                },
              },
              defaultChain: base,
              supportedChains: [base, bsc, arbitrum, polygon, scroll, optimism],
            }}
          >
            <SmartWalletsProvider
              config={{
                paymasterContext: {
                  mode: "SPONSORED",
                  calculateGasLimits: true,
                  expiryDuration: 300,
                  sponsorshipInfo: {
                    webhookData: {},
                    smartAccountInfo: {
                      name: "BICONOMY",
                      version: "2.0.0",
                    },
                  },
                },
              }}
            >
              <ContextProviders>{children}</ContextProviders>
            </SmartWalletsProvider>
          </PrivyProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function ContextProviders({ children }: { children: ReactNode }) {
  return (
    <NetworkProvider>
      <StepProvider>
        {children}
        <Toaster position="bottom-right" theme="dark" />
      </StepProvider>
    </NetworkProvider>
  );
}

export default Providers;
