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
  fetchStarknetBalance,
  getRpcUrl,
  calculateCorrectedTotalBalance,
  getNetworkTokens,
} from "../utils";
import { useCNGNRate, getCNGNRateForNetwork } from "../hooks/useCNGNRate";
import { useMigrationStatus } from "./MigrationStatusContext";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useNetwork } from "./NetworksContext";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { type Chain, createPublicClient, fallback, http } from "viem";
import { useInjectedWallet } from "./InjectedWalletContext";
import { migrationChecklistNetworks, networks } from "../mocks";
import type { Network } from "../types";
import { useStarknet } from "./StarknetContext";
import { bsc } from "viem/chains";

// All networks are fetched in parallel — no artificial concurrency limit

/** Chain IDs included in wallet migration UX (see MIGRATION_EXCLUDED_CHAIN_IDS in mocks). */
const MIGRATION_RELEVANT_CHAIN_IDS = new Set(
  migrationChecklistNetworks.map((n) => n.chain.id),
);

interface WalletBalances {
  total: number;
  balances: Record<string, number>;
  rawBalances?: Record<string, number>; // Raw balances before CNGN conversion
  balancesUsd?: Record<string, number>; // USD value for each token (e.g. Starknet)
}

// Cross-chain balance entry for a single network
export interface CrossChainBalanceEntry {
  network: Network;
  balances: WalletBalances;
}

function sumMigrationRelevantTotals(entries: CrossChainBalanceEntry[]): number {
  return entries.reduce((sum, entry) => {
    if (!MIGRATION_RELEVANT_CHAIN_IDS.has(entry.network.chain.id)) return sum;
    return sum + (entry.balances.total || 0);
  }, 0);
}

function sumAllChainTotals(entries: CrossChainBalanceEntry[]): number {
  return entries.reduce(
    (sum, entry) => sum + (entry.balances.total || 0),
    0,
  );
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
  starknetWalletBalance: WalletBalances | null;
  allBalances: {
    smartWallet: WalletBalances | null;
    externalWallet: WalletBalances | null;
    injectedWallet: WalletBalances | null;
    starknetWallet: WalletBalances | null;
  };
  crossChainBalances: CrossChainBalanceEntry[];
  crossChainTotal: number;
  /** Same as crossChainTotal but excludes chains omitted from migration (e.g. Celo, Scroll). For migration/banner logic only. */
  crossChainTotalMigrationRelevant: number;
  /**
   * Last SCW cross-chain totals (all networks vs migration-eligible only).
   * Used when the UI shows EOA balances but migration logic must still see SCW state (e.g. funds only on excluded chains).
   */
  smartWalletCrossChainTotals: {
    totalAll: number;
    totalMigrationRelevant: number;
  } | null;
  smartWalletRemainingTotal: number;
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
  const { address: starknetAddress } = useStarknet();

  const [smartWalletBalance, setSmartWalletBalance] =
    useState<WalletBalances | null>(null);
  const [externalWalletBalance, setExternalWalletBalance] =
    useState<WalletBalances | null>(null);
  const [injectedWalletBalance, setInjectedWalletBalance] =
    useState<WalletBalances | null>(null);
  const [crossChainBalances, setCrossChainBalances] = useState<
    CrossChainBalanceEntry[]
  >([]);
  const [smartWalletRemainingTotal, setSmartWalletRemainingTotal] =
    useState(0);
  const [smartWalletCrossChainTotals, setSmartWalletCrossChainTotals] =
    useState<{
      totalAll: number;
      totalMigrationRelevant: number;
    } | null>(null);
  const [starknetWalletBalance, setStarknetWalletBalance] =
    useState<WalletBalances | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hook for CNGN rate to correct total balances
  const { rate: cngnRate } = useCNGNRate({
    network: selectedNetwork.chain.name,
    dependencies: [selectedNetwork],
  });

  // Cannot use useShouldUseEOA here (it uses useBalance and would create a circular dependency)
  const { isMigrationComplete, isLoading: isMigrationLoading } = useMigrationStatus();

  const applicableNetworks = networks;
  const evmBalanceNetworks = applicableNetworks.filter(
    (n) => n.chain.name !== "Starknet",
  );

  /**
   * Shared helper: fetches cross-chain balance entries for an address.
   * All networks are fetched in parallel and the CNGN rate is resolved once
   * upfront to avoid redundant API calls.
   */
  const fetchCrossChainEntriesForAddress = async (
    address: string,
  ): Promise<CrossChainBalanceEntry[]> => {
    const cngnRateValue = await getCNGNRateForNetwork(
      applicableNetworks[0]?.chain.name ?? "Base",
    );

    const results = await Promise.allSettled(
      evmBalanceNetworks.map(async (network) => {
        const rpcUrl = getRpcUrl(network.chain.name);
        const evmChain = network.chain as Chain;
        const publicClient = createPublicClient({
          chain: evmChain,
          transport: http(rpcUrl),
        });
        const rawResult = await fetchWalletBalance(publicClient, address);
        const rawBalances = { ...rawResult.balances };
        const correctedTotal = calculateCorrectedTotalBalance(
          rawResult,
          cngnRateValue,
        );
        const correctedBalances = applyCNGNBalanceConversion(
          rawResult.balances,
          cngnRateValue,
        );
        return {
          network,
          balances: {
            total: correctedTotal,
            balances: correctedBalances,
            rawBalances,
          },
        };
      }),
    );

    return results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<CrossChainBalanceEntry>).value);
  };

  const fetchCrossChainBalances = async (address: string) => {
    const entries = await fetchCrossChainEntriesForAddress(address);
    setCrossChainBalances(entries);
  };

  const fetchBalances = async () => {
    const clearAllWalletBalances = () => {
      setSmartWalletBalance(null);
      setExternalWalletBalance(null);
      setInjectedWalletBalance(null);
      setStarknetWalletBalance(null);
      setCrossChainBalances([]);
      setSmartWalletRemainingTotal(0);
      setSmartWalletCrossChainTotals(null);
    };

    /** Clear only per-network balances so migration banner stays correct on fetch error (keeps cross-chain state). */
    const clearPerNetworkBalances = () => {
      setSmartWalletBalance(null);
      setExternalWalletBalance(null);
      setInjectedWalletBalance(null);
      setStarknetWalletBalance(null);
    };

    setIsLoading(true);

    if (isMigrationLoading) return;
    if (!ready) return;

    // Wait for Privy wallets to be populated before making wallet-type decisions.
    // user.linkedAccounts (smartWalletAccount) loads before useWallets() (embeddedWalletAccount),
    // so without this guard, a migrated user's fetch falls into the SCW branch and flashes SCW balance.
    if (user && !isInjectedWallet && wallets.length === 0) return;

    try {
      const resolvedCngnRate =
        cngnRate ?? (await getCNGNRateForNetwork(selectedNetwork.chain.name));

      if (selectedNetwork.chain.name === "Starknet") {
        if (starknetAddress) {
          try {
            const tokens = await getNetworkTokens("Starknet");
            const result = await fetchStarknetBalance(starknetAddress, tokens);

            setStarknetWalletBalance(result);
            setSmartWalletBalance(null);
            setExternalWalletBalance(null);
            setInjectedWalletBalance(null);
            setCrossChainBalances([]);
            setSmartWalletRemainingTotal(0);
            setSmartWalletCrossChainTotals(null);
          } catch (error) {
            console.error("Error fetching Starknet balance:", error);
            setStarknetWalletBalance(null);
          }
        } else {
          setStarknetWalletBalance(null);
          setSmartWalletBalance(null);
          setExternalWalletBalance(null);
          setInjectedWalletBalance(null);
        }

        setIsLoading(false);
        return;
      }

      setStarknetWalletBalance(null);

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

        const selectedChain = selectedNetwork.chain as Chain;
        const publicClient = createPublicClient({
          chain: selectedChain,
          transport:
            selectedChain.id === bsc.id
              ? fallback([
                  http(getRpcUrl(selectedNetwork.chain.name)),
                  http("https://bsc-dataseed.bnbchain.org/"),
                ])
              : http(getRpcUrl(selectedNetwork.chain.name)),
        });

        let primaryIsEOA = false;

        if (isMigrationComplete && embeddedWalletAccount) {
          primaryIsEOA = true;
          setSmartWalletBalance(null);
          setSmartWalletCrossChainTotals(null);

          // Fetch EOA cross-chain and SCW remaining in parallel
          const eoaCrossChainPromise =
            fetchCrossChainEntriesForAddress(embeddedWalletAccount.address);
          const scwRemainingPromise = smartWalletAccount
            ? fetchCrossChainEntriesForAddress(smartWalletAccount.address).then(
                (entries) => sumMigrationRelevantTotals(entries),
              )
            : Promise.resolve(0);

          const [eoaEntries, remaining] = await Promise.all([
            eoaCrossChainPromise,
            scwRemainingPromise,
          ]);

          setCrossChainBalances(eoaEntries);
          setSmartWalletRemainingTotal(remaining);

          // Extract selected-network balance from cross-chain entries
          const selectedEntry = eoaEntries.find(
            (e) => e.network.chain.id === selectedNetwork.chain.id,
          );
          if (selectedEntry) {
            setExternalWalletBalance(selectedEntry.balances);
          } else {
            const result = await fetchWalletBalance(
              publicClient,
              embeddedWalletAccount.address,
            );
            const correctedTotal = calculateCorrectedTotalBalance(
              result,
              resolvedCngnRate,
            );
            setExternalWalletBalance({ ...result, total: correctedTotal });
          }
        } else if (smartWalletAccount) {
          // Not migrated: fetch SCW cross-chain first to determine total and selected-network balance
          const scwCrossChainEntries =
            await fetchCrossChainEntriesForAddress(smartWalletAccount.address);
          const scwCrossChainTotalMigrationRelevant =
            sumMigrationRelevantTotals(scwCrossChainEntries);
          const scwTotalAll = sumAllChainTotals(scwCrossChainEntries);
          setSmartWalletCrossChainTotals({
            totalAll: scwTotalAll,
            totalMigrationRelevant: scwCrossChainTotalMigrationRelevant,
          });

          // Extract selected-network balance from cross-chain entries
          const selectedEntry = scwCrossChainEntries.find(
            (e) => e.network.chain.id === selectedNetwork.chain.id,
          );
          if (selectedEntry) {
            setSmartWalletBalance(selectedEntry.balances);
          } else {
            const result = await fetchWalletBalance(
              publicClient,
              smartWalletAccount.address,
            );
            const rawBalances = { ...result.balances };
            const correctedTotal = calculateCorrectedTotalBalance(result, resolvedCngnRate);
            const correctedBalances = applyCNGNBalanceConversion(result.balances, resolvedCngnRate);
            setSmartWalletBalance({
              total: correctedTotal,
              balances: correctedBalances,
              rawBalances,
            });
          }

          if (scwCrossChainTotalMigrationRelevant === 0 && embeddedWalletAccount) {
            primaryIsEOA = true;
            const eoaEntries =
              await fetchCrossChainEntriesForAddress(embeddedWalletAccount.address);
            setCrossChainBalances(eoaEntries);

            const eoaSelectedEntry = eoaEntries.find(
              (e) => e.network.chain.id === selectedNetwork.chain.id,
            );
            if (eoaSelectedEntry) {
              setExternalWalletBalance(eoaSelectedEntry.balances);
            } else {
              const eoaResult = await fetchWalletBalance(
                publicClient,
                embeddedWalletAccount.address,
              );
              const eoaCorrected = calculateCorrectedTotalBalance(eoaResult, resolvedCngnRate);
              setExternalWalletBalance({ ...eoaResult, total: eoaCorrected });
            }
          } else {
            setExternalWalletBalance(null);
            setCrossChainBalances(scwCrossChainEntries);
          }
        } else if (embeddedWalletAccount) {
          // New user: has embedded wallet — use EOA directly
          primaryIsEOA = true;
          setSmartWalletBalance(null);
          setSmartWalletCrossChainTotals(null);

          const eoaEntries =
            await fetchCrossChainEntriesForAddress(embeddedWalletAccount.address);

          setCrossChainBalances(eoaEntries);
          setSmartWalletRemainingTotal(0);

          const selectedEntry = eoaEntries.find(
            (e) => e.network.chain.id === selectedNetwork.chain.id,
          );
          if (selectedEntry) {
            setExternalWalletBalance(selectedEntry.balances);
          } else {
            const result = await fetchWalletBalance(
              publicClient,
              embeddedWalletAccount.address,
            );
            const rawBalances = { ...result.balances };
            const correctedTotal = calculateCorrectedTotalBalance(
              result,
              resolvedCngnRate,
            );
            const correctedBalances = applyCNGNBalanceConversion(
              result.balances,
              resolvedCngnRate,
            );
            setExternalWalletBalance({
              total: correctedTotal,
              balances: correctedBalances,
              rawBalances,
            });
          }
        } else {
          clearAllWalletBalances();
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
            resolvedCngnRate,
          );
          // Apply CNGN balance conversion and use returned value
          const correctedBalances = applyCNGNBalanceConversion(
            result.balances,
            resolvedCngnRate,
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
          const injectedChain = selectedNetwork.chain as Chain;
          const publicClient = createPublicClient({
            chain: injectedChain,
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
            resolvedCngnRate,
          );
          // Apply CNGN balance conversion and use returned value
          const correctedBalances = applyCNGNBalanceConversion(
            result.balances,
            resolvedCngnRate,
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
          setSmartWalletCrossChainTotals(null);
        } catch (error) {
          console.error("Error fetching injected wallet balance:", error);
          clearAllWalletBalances();
        }
      }
    } catch (error) {
      console.error("Error fetching balances:", error);
      // Preserve crossChainBalances and smartWalletRemainingTotal so migration banner
      // and address don't flip to zero-balance UI when switching networks causes RPC errors
      clearPerNetworkBalances();
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
    starknetAddress,
    cngnRate,
    isMigrationComplete,
    isMigrationLoading,
  ]);

  useEffect(() => {
    if (!user && !isInjectedWallet && !starknetAddress) {
      setSmartWalletBalance(null);
      setExternalWalletBalance(null);
      setInjectedWalletBalance(null);
      setStarknetWalletBalance(null);
      setIsLoading(false);
    }
  }, [user, isInjectedWallet, starknetAddress]);

  const allBalances = {
    smartWallet: smartWalletBalance,
    externalWallet: externalWalletBalance,
    injectedWallet: injectedWalletBalance,
    starknetWallet: starknetWalletBalance,
  };

  // Calculate cross-chain total for the active wallet type (balances are already CNGN-corrected)
  const crossChainTotal = crossChainBalances.reduce((total, entry) => {
    return total + (entry.balances.total || 0);
  }, 0);
  const crossChainTotalMigrationRelevant =
    sumMigrationRelevantTotals(crossChainBalances);

  return (
    <BalanceContext.Provider
      value={{
        smartWalletBalance,
        externalWalletBalance,
        injectedWalletBalance,
        starknetWalletBalance,
        allBalances,
        crossChainBalances,
        crossChainTotal,
        crossChainTotalMigrationRelevant,
        smartWalletCrossChainTotals,
        smartWalletRemainingTotal,
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
