"use client";
import { Toaster } from "sonner";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";

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
import { EmbedNetworkLockApplier } from "./components/EmbedNetworkLockApplier";
import { useActualTheme } from "./hooks/useActualTheme";
import { useDatadogRum, useMixpanel } from "./hooks/analytics/client";
import { BlockFestClaimProvider } from "./context/BlockFestClaimContext";
import { useSentry } from "./hooks/useSentry";

function Providers({ children }: { children: ReactNode }) {
  const { privyAppId } = config;
  const queryClient = new QueryClient();
  const isWidget = isEmbedPath(usePathname());

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {/* Embed mode: hosts pin the widget's initial theme via ?theme=dark|light.
          A dynamic defaultTheme can't do this safely — the RootLayout is
          force-static, so next-themes' anti-FOUC script gets baked with the
          SSR-time fallback ("system") regardless of the real request URL.
          This runs client-only, once per load: the partner's param wins on
          every fresh load (deterministic embed appearance, regardless of
          stale localStorage), while Settings > Theme keeps working for the
          rest of the session since the sync never re-applies after mount. */}
      {isWidget && <EmbedThemeSync />}
      <QueryClientProvider client={queryClient}>
        <PrivyConfigWrapper privyAppId={privyAppId}>
          {children}
        </PrivyConfigWrapper>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function EmbedThemeSync() {
  const { setTheme } = useTheme();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (typeof window === "undefined") return;
    const theme = new URLSearchParams(window.location.search).get("theme");
    if (theme === "dark" || theme === "light") setTheme(theme);
  }, [setTheme]);

  return null;
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
  useMixpanel(); // Initialize Mixpanel analytics
  useSentry(); // Initialize Sentry error tracking
  const isEmbed = isEmbedPath(usePathname());
  // No client-side trackers inside partner iframes; source-domain attribution
  // happens server-side in middleware.ts instead.
  useMixpanel(!isEmbed);
  useDatadogRum(!isEmbed);

  return (
    <EmbedProvider>
      <NetworkProvider>
      <HomeTransactionFormModeProvider>
        <InjectedWalletProvider>
          <EmbedNetworkLockApplier />
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
