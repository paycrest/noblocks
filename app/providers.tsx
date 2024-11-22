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
import { BiconomyProvider } from "@biconomy/use-aa";
import { PrivyProvider } from "@privy-io/react-auth";
import { createConfig, http, WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

import config from "./lib/config";
import { NetworkProvider, SmartAccountProvider, StepProvider } from "./context";

function Providers({ children }: { children: ReactNode }) {
  const { bundlerUrl, privyAppId, paymasterApiKey } = config;

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
          <BiconomyProvider
            config={{
              biconomyPaymasterApiKey: paymasterApiKey,
              bundlerUrl,
            }}
            queryClient={queryClient}
          >
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
                supportedChains: [
                  base,
                  bsc,
                  arbitrum,
                  polygon,
                  scroll,
                  optimism,
                ],
              }}
            >
              <ContextProviders>{children}</ContextProviders>
            </PrivyProvider>
          </BiconomyProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function ContextProviders({ children }: { children: ReactNode }) {
  return (
    <NetworkProvider>
      <SmartAccountProvider>
        <StepProvider>
          {children}
          <Toaster position="bottom-right" theme="dark" />
        </StepProvider>
      </SmartAccountProvider>
    </NetworkProvider>
  );
}

export default Providers;
