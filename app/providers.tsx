"use client";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";
import { PrivyProvider } from "@privy-io/react-auth";
import { NetworkProvider } from "./context/NetworksContext";
import {
  arbitrum,
  base,
  bsc,
  mainnet,
  optimism,
  polygon,
  scroll,
} from "viem/chains";
import { StepProvider } from "./context/StepContext";
import { createConfig, http, WagmiProvider } from "wagmi";
import { type ReactNode } from "react";
import { BiconomyProvider } from "@biconomy/use-aa";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID)
  throw new Error("One or more environment variables are not set");

export default function Providers({ children }: { children: ReactNode }) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";
  const biconomyPaymasterApiKey =
    process.env.NEXT_PUBLIC_PAYMASTER_API_KEY || "";
  const bundlerUrl = process.env.NEXT_PUBLIC_BUNDLER_URL || "";

  const config = createConfig({
    chains: [mainnet],
    transports: {
      [mainnet.id]: http(),
    },
  });

  const queryClient = new QueryClient();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={config}>
          <BiconomyProvider
            config={{
              biconomyPaymasterApiKey,
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
              <NetworkProvider>
                <StepProvider>
                  {children}

                  <Toaster position="bottom-right" theme="dark" />
                </StepProvider>
              </NetworkProvider>
            </PrivyProvider>
          </BiconomyProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
