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
  HomeTransactionFormModeProvider,
  InjectedWalletProvider,
  KYCProvider,
  MigrationStatusProvider,
  NetworkProvider,
  RocketStatusProvider,
  StarknetProvider,
  StarknetExportModalProvider,
  StepProvider,
  TokensProvider,
  TransactionsProvider,
  BlockFestModalProvider,
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
      {/* Sponsorship is handled via Biconomy MEE (Supertransaction API). */}
      <SmartWalletsProvider config={{}}>
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
      <HomeTransactionFormModeProvider>
        <InjectedWalletProvider>
          <MigrationStatusProvider>
            <StarknetProvider>
              <StarknetExportModalProvider>
                <TokensProvider>
                  <StepProvider>
                    <BalanceProvider>
                      <TransactionsProvider>
                        <KYCProvider>
                          <BlockFestClaimProvider>
                            <BlockFestModalProvider>
                              <RocketStatusProvider>
                                {children}
                              </RocketStatusProvider>
                            </BlockFestModalProvider>
                          </BlockFestClaimProvider>
                        </KYCProvider>
                      </TransactionsProvider>
                    </BalanceProvider>
                  </StepProvider>
                </TokensProvider>
              </StarknetExportModalProvider>
            </StarknetProvider>
          </MigrationStatusProvider>
        </InjectedWalletProvider>
      </HomeTransactionFormModeProvider>
    </NetworkProvider>
  );
}

export default Providers;
