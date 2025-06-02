"use client";
import { Toaster } from "sonner";
import { type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { ThirdwebProvider } from "thirdweb/react";

import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { darkModeConfig, lightModeConfig } from "./lib/privy-config";

import config from "./lib/config";
import {
  BalanceProvider,
  InjectedWalletProvider,
  NetworkProvider,
  StepProvider,
} from "./context";
import { TransactionsProvider } from "./context/TransactionsContext";
import { useActualTheme } from "./hooks/useActualTheme";

function Providers({ children }: { children: ReactNode }) {
  const { privyAppId } = config;
  const queryClient = new QueryClient();

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <PrivyConfigWrapper privyAppId={privyAppId}>
          <ThirdwebProvider>{children}</ThirdwebProvider>
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
  return (
    <NetworkProvider>
      <InjectedWalletProvider>
        <StepProvider>
          <BalanceProvider>
            <TransactionsProvider>{children}</TransactionsProvider>
          </BalanceProvider>
        </StepProvider>
      </InjectedWalletProvider>
    </NetworkProvider>
  );
}

export default Providers;
