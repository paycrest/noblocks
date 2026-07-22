"use client";
import { Toaster } from "sonner";
import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
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
  TronProvider,
  StepProvider,
  TokensProvider,
  TransactionsProvider,
  BlockFestModalProvider,
  EmbedProvider,
  isEmbedPath,
} from "./context";
import { useActualTheme } from "./hooks/useActualTheme";
import { useMixpanel } from "./hooks/analytics/client";
import { BlockFestClaimProvider } from "./context/BlockFestClaimContext";

function Providers({ children }: { children: ReactNode }) {
  const { privyAppId } = config;
  const queryClient = new QueryClient();
  const isWidget = isEmbedPath(usePathname());

  // Embed mode: hosts pin the widget theme via ?theme=dark|light. Read from
  // window.location instead of useSearchParams (no Suspense boundary here),
  // and force it only on /widget so the user's stored preference is untouched.
  const [embedTheme] = useState<"dark" | "light" | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const theme = new URLSearchParams(window.location.search).get("theme");
    return theme === "dark" || theme === "light" ? theme : undefined;
  });

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      forcedTheme={isWidget ? embedTheme : undefined}
    >
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
      {/* EIP-7702 sponsorship via Noblocks sponsor wallet. */}
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
  const isEmbed = isEmbedPath(usePathname());
  // No client-side trackers inside partner iframes; source-domain attribution
  // happens server-side in middleware.ts instead.
  useMixpanel(!isEmbed);

  return (
    <EmbedProvider>
      <NetworkProvider>
      <HomeTransactionFormModeProvider>
        <InjectedWalletProvider>
          <MigrationStatusProvider>
            <StarknetProvider>
              <StarknetExportModalProvider>
                <TronProvider>
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
                </TronProvider>
              </StarknetExportModalProvider>
            </StarknetProvider>
          </MigrationStatusProvider>
        </InjectedWalletProvider>
      </HomeTransactionFormModeProvider>
      </NetworkProvider>
    </EmbedProvider>
  );
}

export default Providers;
