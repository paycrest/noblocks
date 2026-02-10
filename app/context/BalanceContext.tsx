"use client";
import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  fetchWalletBalance,
  getRpcUrl,
  calculateCorrectedTotalBalance,
} from "../utils";
import { useCNGNRate, getCNGNRateForNetwork } from "../hooks/useCNGNRate";
import { useMigrationStatus } from "../hooks/useEIP7702Account";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useNetwork } from "./NetworksContext";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { createPublicClient, http } from "viem";
import { useInjectedWallet } from "./InjectedWalletContext";
import { bsc } from "viem/chains";
import { networks } from "../mocks";
import type { Network } from "../types";

const CROSS_CHAIN_CONCURRENCY = 3; // Limit parallel RPC requests

interface WalletBalances {
  total: number;
  balances: Record<string, number>;
  rawBalances?: Record<string, number>; // Raw balances before CNGN conversion
}

// Cross-chain balance entry for a single network
export interface CrossChainBalanceEntry {
  network: Network;
  balances: WalletBalances;
}

/**
 * Applies CNGN balance conversion logic to balances
 * @param balances - The balance object to convert
 * @param cngnRate - The current CNGN rate (can be null for fallback handling)
 * @returns New balances object with CNGN conversion applied
 */
function applyCNGNBalanceConversion(
  balances: Record<string, number>,
  cngnRate: number | null,
): Record<string, number> {
  const correctedBalances = { ...balances };
  const cngnSymbols = ["CNGN", "cNGN"] as const;

  cngnSymbols.forEach((symbol) => {
    const cngnBalance = correctedBalances[symbol];
    if (
      typeof cngnBalance !== "number" ||
      isNaN(cngnBalance) ||
      cngnBalance <= 0
    ) {
      return;
    }

    if (cngnRate && cngnRate > 0) {
      // Convert CNGN to USD equivalent
      correctedBalances[symbol] = cngnBalance / cngnRate;
      return;
    }

    // No rate available - set CNGN balance to 0 so it doesn't contribute to totals
    correctedBalances[symbol] = 0;
  });

  return correctedBalances;
}

interface BalanceContextProps {
  smartWalletBalance: WalletBalances | null;
  externalWalletBalance: WalletBalances | null;
  injectedWalletBalance: WalletBalances | null;
  allBalances: {
    smartWallet: WalletBalances | null;
    externalWallet: WalletBalances | null;
    injectedWallet: WalletBalances | null;
  };
  crossChainBalances: CrossChainBalanceEntry[];
  crossChainTotal: number;
  refreshBalance: () => void;
  isLoading: boolean;
}

const BalanceContext = createContext<BalanceContextProps | undefined>(
  undefined,
);

export const BalanceProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { ready, user } = usePrivy();
  const { wallets } = useWallets();
  const { client } = useSmartWallets();
  const { selectedNetwork } = useNetwork();
  const { isInjectedWallet, injectedAddress, injectedReady, injectedProvider } =
    useInjectedWallet();

  const [smartWalletBalance, setSmartWalletBalance] =
    useState<WalletBalances | null>(null);
  const [externalWalletBalance, setExternalWalletBalance] =
    useState<WalletBalances | null>(null);
  const [injectedWalletBalance, setInjectedWalletBalance] =
    useState<WalletBalances | null>(null);
  const [crossChainBalances, setCrossChainBalances] = useState<
    CrossChainBalanceEntry[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  // Hook for CNGN rate to correct total balances
  const { rate: cngnRate } = useCNGNRate({
    network: selectedNetwork.chain.name,
    dependencies: [selectedNetwork],
  });

  // Cannot use useShouldUseEOA here (it uses useBalance and would create a circular dependency)
  const { isMigrationComplete } = useMigrationStatus();
  // Fetch balances from all networks in parallel
  const fetchCrossChainBalances = async (address: string) => {
    const results: PromiseSettledResult<CrossChainBalanceEntry>[] = [];

    // Process networks in batches
    for (let i = 0; i < networks.length; i += CROSS_CHAIN_CONCURRENCY) {
      const batch = networks.slice(i, i + CROSS_CHAIN_CONCURRENCY);

      const batchResults = await Promise.allSettled(
        batch.map(async (network) => {
          const publicClient = createPublicClient({
            chain: network.chain,
            transport: http(getRpcUrl(network.chain.name)),
          });

          const rawResult = await fetchWalletBalance(publicClient, address);

          // Apply CNGN correction for this specific network
          const cngnRate = await getCNGNRateForNetwork(network.chain.name);

          // Store raw balances before any modifications
          const rawBalances = { ...rawResult.balances };

          const correctedTotal = calculateCorrectedTotalBalance(
            rawResult,
            cngnRate,
          );

          // Apply CNGN balance conversion and use returned value
          const correctedBalances = applyCNGNBalanceConversion(
            rawResult.balances,
            cngnRate,
          );

          const correctedResult = {
            total: correctedTotal,
            balances: correctedBalances,
            rawBalances: rawBalances,
          };

          return {
            network,
            balances: correctedResult,
          };
        }),
      );

      results.push(
        ...(batchResults as PromiseSettledResult<CrossChainBalanceEntry>[]),
      );
    }

    // Filter fulfilled results, skip rejected (RPC failures)
    const successfulResults = results
      .filter((result) => result.status === "fulfilled")
      .map(
        (result) =>
          (result as PromiseFulfilledResult<CrossChainBalanceEntry>).value,
      );

    setCrossChainBalances(successfulResults);
  };

  const fetchBalances = async () => {
    const clearAllWalletBalances = () => {
      setSmartWalletBalance(null);
      setExternalWalletBalance(null);
      setInjectedWalletBalance(null);
      setCrossChainBalances([]);
    };

    setIsLoading(true);

    try {
      if (ready && !isInjectedWallet) {
        const smartWalletAccount = user?.linkedAccounts.find(
          (account) => account.type === "smart_wallet",
        );
        const embeddedWalletAccount = wallets.find(
          (wallet) => wallet.walletClientType === "privy"
        );
        const externalWalletAccount = wallets.find(
          (account) => account.connectorType === "injected",
        );

        if (client) {
          try {
            await client.switchChain({
              id: selectedNetwork.chain.id,
            });
          } catch (error) {
            console.warn("Error switching smart wallet chain:", error);
          }
        }

        const publicClient = createPublicClient({
          chain: selectedNetwork.chain,
          transport: http(
            selectedNetwork.chain.id === bsc.id
              ? "https://bsc-dataseed.bnbchain.org/"
              : getRpcUrl(selectedNetwork.chain.name),
          ),
        });

        let primaryIsEOA = false;

        if (isMigrationComplete && embeddedWalletAccount) {
          // Migrated in DB: use EOA balance
          primaryIsEOA = true;
          const result = await fetchWalletBalance(
            publicClient,
            embeddedWalletAccount.address,
          );
          const correctedTotal = calculateCorrectedTotalBalance(
            result,
            cngnRate,
          );
          setExternalWalletBalance({
            ...result,
            total: correctedTotal,
          });
          setSmartWalletBalance(null);
        } else if (smartWalletAccount) {
          // Not migrated: fetch SCW balance first
          const result = await fetchWalletBalance(
            publicClient,
            smartWalletAccount.address,
          );

          // Store raw balances BEFORE any modifications
          const rawBalances = { ...result.balances };

          // Apply cNGN conversion correction
          const correctedTotal = calculateCorrectedTotalBalance(
            result,
            cngnRate,
          );
          // Apply CNGN balance conversion and use returned value
          const correctedBalances = applyCNGNBalanceConversion(
            result.balances,
            cngnRate,
          );

          setSmartWalletBalance({
            total: correctedTotal,
            balances: correctedBalances,
            rawBalances: rawBalances,
          });
          // If SCW balance is 0, also fetch EOA so 0-balance users see EOA in nav (useShouldUseEOA is true elsewhere)
          if (correctedTotal === 0 && embeddedWalletAccount) {
            primaryIsEOA = true;
            const eoaResult = await fetchWalletBalance(
              publicClient,
              embeddedWalletAccount.address,
            );
            const eoaCorrected = calculateCorrectedTotalBalance(
              eoaResult,
              cngnRate,
            );
            setExternalWalletBalance({
              ...eoaResult,
              total: eoaCorrected,
            });
          } else {
            setExternalWalletBalance(null);
          }

          // Fetch cross-chain balances for smart wallet
          await fetchCrossChainBalances(smartWalletAccount.address);
        } else {
          setSmartWalletBalance(null);
          setExternalWalletBalance(null);
        }

        // Handle external injected wallets (separate from embedded wallet) – don't overwrite EOA balance for 0-balance users
        if (externalWalletAccount &&
          externalWalletAccount.address !== embeddedWalletAccount?.address &&
          !isMigrationComplete &&
          !primaryIsEOA) {
          const result = await fetchWalletBalance(
            publicClient,
            externalWalletAccount.address,
          );

          // Store raw balances BEFORE any modifications
          const rawBalances = { ...result.balances };

          // Apply cNGN conversion correction
          const correctedTotal = calculateCorrectedTotalBalance(
            result,
            cngnRate,
          );
          // Apply CNGN balance conversion and use returned value
          const correctedBalances = applyCNGNBalanceConversion(
            result.balances,
            cngnRate,
          );

          setExternalWalletBalance({
            total: correctedTotal,
            balances: correctedBalances,
            rawBalances: rawBalances,
          });
        }

        setInjectedWalletBalance(null);
      } else if (
        isInjectedWallet &&
        injectedReady &&
        injectedAddress &&
        injectedProvider
      ) {
        try {
          const publicClient = createPublicClient({
            chain: selectedNetwork.chain,
            transport: http(getRpcUrl(selectedNetwork.chain.name)),
          });

          const result = await fetchWalletBalance(
            publicClient,
            injectedAddress,
          );

          // Store raw balances BEFORE any modifications
          const rawBalances = { ...result.balances };

          // Apply cNGN conversion correction
          const correctedTotal = calculateCorrectedTotalBalance(
            result,
            cngnRate,
          );
          // Apply CNGN balance conversion and use returned value
          const correctedBalances = applyCNGNBalanceConversion(
            result.balances,
            cngnRate,
          );

          setInjectedWalletBalance({
            total: correctedTotal,
            balances: correctedBalances,
            rawBalances: rawBalances,
          });

          // Fetch cross-chain balances for injected wallet
          await fetchCrossChainBalances(injectedAddress);

          setSmartWalletBalance(null);
          setExternalWalletBalance(null);
        } catch (error) {
          console.error("Error fetching injected wallet balance:", error);
          clearAllWalletBalances();
        }
      }
    } catch (error) {
      console.error("Error fetching balances:", error);
      clearAllWalletBalances();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    user,
    wallets,
    selectedNetwork,
    isInjectedWallet,
    injectedReady,
    injectedAddress,
    cngnRate,
    isMigrationComplete,
  ]);

  const allBalances = {
    smartWallet: smartWalletBalance,
    externalWallet: externalWalletBalance,
    injectedWallet: injectedWalletBalance,
  };

  // Calculate cross-chain total for the active wallet type (balances are already CNGN-corrected)
  const crossChainTotal = crossChainBalances.reduce((total, entry) => {
    return total + (entry.balances.total || 0);
  }, 0);

  return (
    <BalanceContext.Provider
      value={{
        smartWalletBalance,
        externalWalletBalance,
        injectedWalletBalance,
        allBalances,
        crossChainBalances,
        crossChainTotal,
        refreshBalance: fetchBalances,
        isLoading,
      }}
    >
      {children}
    </BalanceContext.Provider>
  );
};

export const useBalance = () => {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error("useBalance must be used within a BalanceProvider");
  }
  return context;
};
