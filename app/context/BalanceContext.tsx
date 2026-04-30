"use client";
import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  fetchWalletBalance,
  fetchStarknetBalance,
  getRpcUrl,
  calculateCorrectedTotalBalance,
  getNetworkTokens,
} from "../utils";
import {
  useCNGNRate,
  getCNGNRateForNetwork,
  CNGN_CROSS_CHAIN_QUOTE_NETWORK,
} from "../hooks/useCNGNRate";
import { logBalanceTelemetry } from "../lib/balanceTelemetry";
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

export interface WalletBalances {
  total: number;
  balances: Record<string, number>;
  rawBalances?: Record<string, number>; // Raw balances before CNGN conversion
  balancesUsd?: Record<string, number>; // USD value for each token (e.g. Starknet)
  /** True when user holds CNGN but no USD/NGN rate was available for conversion. */
  cngnUsdUnknown?: boolean;
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

function hasPositiveCngn(raw: Record<string, number>): boolean {
  for (const k of ["CNGN", "cNGN"] as const) {
    const v = raw[k];
    if (typeof v === "number" && !isNaN(v) && v > 0) return true;
  }
  return false;
}

function buildWalletBalancesFromRaw(
  rawBalances: Record<string, number>,
  rate: number | null,
): WalletBalances {
  const rawTotal = Object.values(rawBalances).reduce(
    (s, v) => s + (typeof v === "number" && !isNaN(v) ? v : 0),
    0,
  );
  const rawResult = { total: rawTotal, balances: rawBalances };
  const correctedTotal = calculateCorrectedTotalBalance(rawResult, rate);
  const correctedBalances = applyCNGNBalanceConversion(rawBalances, rate);
  return {
    total: correctedTotal,
    balances: correctedBalances,
    rawBalances: { ...rawBalances },
    cngnUsdUnknown:
      hasPositiveCngn(rawBalances) && !(rate != null && rate > 0),
  };
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
  /** Manual refresh: bypasses RPC cache so users see authoritative balances. */
  refreshBalance: () => Promise<void>;
  /** Background/SWR refresh: respects RPC cache, reuses cached snapshots when fresh. */
  softRefresh: () => Promise<void>;
  isLoading: boolean;
  /** True when a refresh is in flight but cached balances for the current identity are already shown. */
  isRefreshing: boolean;
}

type IdentityKeyInput = {
  isInjectedWallet: boolean;
  injectedAddress: string | null;
  embeddedAddr: string | undefined;
  smartAddr: string | undefined;
  starknetAddress: string | null;
  isStarknetSelected: boolean;
};

function buildIdentityKey(o: IdentityKeyInput): string {
  if (o.isInjectedWallet) return `inj:${o.injectedAddress ?? ""}`;
  if (o.isStarknetSelected) return `stk:${o.starknetAddress ?? ""}`;
  return `evm:${o.smartAddr ?? ""}|${o.embeddedAddr ?? ""}`;
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
  const bypassCacheNextFetchRef = useRef(false);
  /** Identity (addresses) for the last fetch that reached its finally block. Drives isRefreshing on wallet swap. */
  const lastFetchedKeyRef = useRef<string>("");

  // CNGN rate for balance correction: same corridor as cross-chain batch (stable NGN↔USD quote).
  const { rate: cngnRate } = useCNGNRate({
    network: CNGN_CROSS_CHAIN_QUOTE_NETWORK,
    dependencies: [],
  });

  // Cannot use useShouldUseEOA here (it uses useBalance and would create a circular dependency)
  const { isMigrationComplete, isLoading: isMigrationLoading } = useMigrationStatus();

  const evmBalanceNetworks = networks.filter(
    (n) => n.chain.name !== "Starknet",
  );

  /**
   * Cross-chain entries: fetches RPC balances in parallel with the CNGN rate
   * (same wall time as the slower of the two), then applies correction.
   */
  const fetchCrossChainEntriesForAddress = async (
    address: string,
    options?: { bypassCache?: boolean },
  ): Promise<CrossChainBalanceEntry[]> => {
    const tBatch = performance.now();
    const rateStarted = performance.now();
    const ratePromise = getCNGNRateForNetwork(CNGN_CROSS_CHAIN_QUOTE_NETWORK, {
      bypassCache: options?.bypassCache,
    }).then((r) => {
      logBalanceTelemetry("cngn_rate_cross_chain", {
        ms: Math.round(performance.now() - rateStarted),
        nullRate: r == null,
        corridor: CNGN_CROSS_CHAIN_QUOTE_NETWORK,
        bypassCache: !!options?.bypassCache,
      });
      return r;
    });

    const chainsPromise = Promise.allSettled(
      evmBalanceNetworks.map(async (network) => {
        const rpcUrl = getRpcUrl(network.chain.name);
        const evmChain = network.chain as Chain;
        const publicClient = createPublicClient({
          chain: evmChain,
          transport: http(rpcUrl),
        });
        const rawResult = await fetchWalletBalance(publicClient, address, {
          bypassCache: options?.bypassCache,
        });
        return {
          network,
          rawResult,
        };
      }),
    );

    const [cngnRateValue, settled] = await Promise.all([
      ratePromise,
      chainsPromise,
    ]);

    logBalanceTelemetry("cross_chain_batch", {
      totalMs: Math.round(performance.now() - tBatch),
      fulfilled: settled.filter((s) => s.status === "fulfilled").length,
      chainCount: evmBalanceNetworks.length,
      bypassCache: !!options?.bypassCache,
    });

    return settled
      .filter((r) => r.status === "fulfilled")
      .map((r) => {
        const { network, rawResult } = (
          r as PromiseFulfilledResult<{
            network: Network;
            rawResult: Awaited<ReturnType<typeof fetchWalletBalance>>;
          }>
        ).value;
        const rawBalances = { ...rawResult.balances };
        return {
          network,
          balances: buildWalletBalancesFromRaw(rawBalances, cngnRateValue),
        };
      });
  };

  const fetchCrossChainBalances = async (
    address: string,
    opts?: { bypassCache?: boolean },
  ) => {
    const entries = await fetchCrossChainEntriesForAddress(address, opts);
    setCrossChainBalances(entries);
  };

  const fetchBalances = async () => {
    const bypassCache = bypassCacheNextFetchRef.current;
    bypassCacheNextFetchRef.current = false;

    const smartWalletAccountForKey = user?.linkedAccounts.find(
      (account) => account.type === "smart_wallet",
    ) as { address?: string } | undefined;
    const embeddedWalletAccountForKey = wallets.find(
      (wallet) => wallet.walletClientType === "privy",
    );
    const fetchIdentityKey = buildIdentityKey({
      isInjectedWallet,
      injectedAddress: injectedAddress ?? null,
      embeddedAddr: embeddedWalletAccountForKey?.address,
      smartAddr: smartWalletAccountForKey?.address,
      starknetAddress: starknetAddress ?? null,
      isStarknetSelected: selectedNetwork.chain.name === "Starknet",
    });

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
        cngnRate ??
        (await getCNGNRateForNetwork(CNGN_CROSS_CHAIN_QUOTE_NETWORK));

      if (selectedNetwork.chain.name === "Starknet") {
        if (starknetAddress) {
          try {
            const tokens = await getNetworkTokens("Starknet");
            const result = await fetchStarknetBalance(starknetAddress, tokens);

            setStarknetWalletBalance(result);
            setSmartWalletBalance(null);
            setExternalWalletBalance(null);
            setInjectedWalletBalance(null);
            const starknetNetwork = networks.find(
              (n) => n.chain.name === "Starknet",
            );
            setCrossChainBalances(
              starknetNetwork
                ? [{ network: starknetNetwork, balances: result }]
                : [],
            );
            setSmartWalletRemainingTotal(0);
            setSmartWalletCrossChainTotals(null);
          } catch (error) {
            console.error("Error fetching Starknet balance:", error);
            setStarknetWalletBalance(null);
            setCrossChainBalances([]);
            setSmartWalletRemainingTotal(0);
            setSmartWalletCrossChainTotals(null);
          }
        } else {
          setStarknetWalletBalance(null);
          setSmartWalletBalance(null);
          setExternalWalletBalance(null);
          setInjectedWalletBalance(null);
          setCrossChainBalances([]);
          setSmartWalletRemainingTotal(0);
          setSmartWalletCrossChainTotals(null);
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
            fetchCrossChainEntriesForAddress(embeddedWalletAccount.address, {
              bypassCache,
            });
          const scwRemainingPromise = smartWalletAccount
            ? fetchCrossChainEntriesForAddress(smartWalletAccount.address, {
                bypassCache,
              }).then((entries) => sumMigrationRelevantTotals(entries))
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
              { bypassCache },
            );
            setExternalWalletBalance(
              buildWalletBalancesFromRaw({ ...result.balances }, resolvedCngnRate),
            );
          }
        } else if (smartWalletAccount) {
          // Not migrated: fetch SCW cross-chain first to determine total and selected-network balance
          const scwCrossChainEntries =
            await fetchCrossChainEntriesForAddress(smartWalletAccount.address, {
              bypassCache,
            });
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
              { bypassCache },
            );
            const rawBalances = { ...result.balances };
            setSmartWalletBalance(
              buildWalletBalancesFromRaw(rawBalances, resolvedCngnRate),
            );
          }

          if (scwCrossChainTotalMigrationRelevant === 0 && embeddedWalletAccount) {
            primaryIsEOA = true;
            const eoaEntries =
              await fetchCrossChainEntriesForAddress(embeddedWalletAccount.address, {
                bypassCache,
              });
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
                { bypassCache },
              );
              setExternalWalletBalance(
                buildWalletBalancesFromRaw(
                  { ...eoaResult.balances },
                  resolvedCngnRate,
                ),
              );
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
            await fetchCrossChainEntriesForAddress(embeddedWalletAccount.address, {
              bypassCache,
            });

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
              { bypassCache },
            );
            const rawBalances = { ...result.balances };
            setExternalWalletBalance(
              buildWalletBalancesFromRaw(rawBalances, resolvedCngnRate),
            );
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
            { bypassCache },
          );

          // Store raw balances BEFORE any modifications
          const rawBalances = { ...result.balances };

          setExternalWalletBalance(
            buildWalletBalancesFromRaw(rawBalances, resolvedCngnRate),
          );
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
            { bypassCache },
          );

          // Store raw balances BEFORE any modifications
          const rawBalances = { ...result.balances };

          setInjectedWalletBalance(
            buildWalletBalancesFromRaw(rawBalances, resolvedCngnRate),
          );

          // Fetch cross-chain balances for injected wallet
          await fetchCrossChainBalances(injectedAddress, { bypassCache });

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
      lastFetchedKeyRef.current = fetchIdentityKey;
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
    isMigrationComplete,
    isMigrationLoading,
  ]);

  useEffect(() => {
    if (cngnRate == null || !(cngnRate > 0)) return;

    const patch = (w: WalletBalances | null) =>
      w?.rawBalances ? buildWalletBalancesFromRaw(w.rawBalances, cngnRate) : w;

    setCrossChainBalances((prev) =>
      prev.map((e) =>
        e.balances.rawBalances
          ? {
              ...e,
              balances: buildWalletBalancesFromRaw(
                e.balances.rawBalances,
                cngnRate,
              ),
            }
          : e,
      ),
    );
    setSmartWalletBalance((prev) => patch(prev));
    setExternalWalletBalance((prev) => patch(prev));
    setInjectedWalletBalance((prev) => patch(prev));
  }, [cngnRate]);

  useEffect(() => {
    if (!user && !isInjectedWallet && !starknetAddress) {
      setSmartWalletBalance(null);
      setExternalWalletBalance(null);
      setInjectedWalletBalance(null);
      setStarknetWalletBalance(null);
      setCrossChainBalances([]);
      setSmartWalletRemainingTotal(0);
      setSmartWalletCrossChainTotals(null);
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

  const hasCachedBalances =
    crossChainBalances.length > 0 ||
    smartWalletBalance != null ||
    externalWalletBalance != null ||
    injectedWalletBalance != null ||
    starknetWalletBalance != null;

  const currentIdentityKey = buildIdentityKey({
    isInjectedWallet,
    injectedAddress: injectedAddress ?? null,
    embeddedAddr: wallets.find((w) => w.walletClientType === "privy")?.address,
    smartAddr: (
      user?.linkedAccounts.find(
        (a) => a.type === "smart_wallet",
      ) as { address?: string } | undefined
    )?.address,
    starknetAddress: starknetAddress ?? null,
    isStarknetSelected: selectedNetwork.chain.name === "Starknet",
  });
  const identityMatchesLastFetch =
    lastFetchedKeyRef.current !== "" &&
    lastFetchedKeyRef.current === currentIdentityKey;
  const isRefreshing =
    isLoading && hasCachedBalances && identityMatchesLastFetch;

  const refreshBalance = (): Promise<void> => {
    bypassCacheNextFetchRef.current = true;
    return fetchBalances();
  };
  const softRefresh = (): Promise<void> => fetchBalances();

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
        refreshBalance,
        softRefresh,
        isLoading,
        isRefreshing,
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
