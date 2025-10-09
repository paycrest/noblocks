"use client";
import { Toaster } from "sonner";
import { type ReactNode } from "react";
import { ThemeProvider } from "next-themes";

import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { darkModeConfig, lightModeConfig } from "./lib/privy-config";

import config from "./lib/config";
import {
  BalanceProvider,
  InjectedWalletProvider,
  NetworkProvider,
  RocketStatusProvider,
  StepProvider,
  TokensProvider,
  TransactionsProvider,
} from "./context";
import { useActualTheme } from "./hooks/useActualTheme";
import { useMixpanel } from "./hooks/analytics/client";
import { BlockFestClaimProvider } from "./context/BlockFestClaimContext";

function Providers({ children }: { children: ReactNode }) {
  const { privyAppId } = config;
  const queryClient = new QueryClient();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <PrivyConfigWrapper privyAppId={privyAppId}>
          {children}
        </PrivyConfigWrapper>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function PrivyConfigWrapper({
  children,
  privyAppId,
}: {
  children: ReactNode;
  privyAppId: string;
}) {
  const isDark = useActualTheme();

  return (
    <PrivyProvider
      appId={privyAppId}
      config={isDark ? darkModeConfig : lightModeConfig}
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
        <Toaster
          position={
            typeof window !== "undefined" && window.innerWidth < 640
              ? "top-center"
              : "bottom-right"
          }
          theme={isDark ? "dark" : "light"}
        />
      </SmartWalletsProvider>
    </PrivyProvider>
  );
}

function ContextProviders({ children }: { children: ReactNode }) {
  useMixpanel(); // Initialize Mixpanel analytics

  return (
    <NetworkProvider>
      <InjectedWalletProvider>
        <TokensProvider>
          <StepProvider>
            <BalanceProvider>
              <TransactionsProvider>
                <BlockFestClaimProvider>
                  <RocketStatusProvider>{children}</RocketStatusProvider>
                </BlockFestClaimProvider>
              </TransactionsProvider>
            </BalanceProvider>
          </StepProvider>
        </TokensProvider>
      </InjectedWalletProvider>
    </NetworkProvider>
  );
}

export default Providers;
