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
import { useCNGNRate } from "../hooks/useCNGNRate";
import { useMigrationStatus } from "../hooks/useEIP7702Account";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useNetwork } from "./NetworksContext";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { createPublicClient, http } from "viem";
import { useInjectedWallet } from "./InjectedWalletContext";
import { bsc } from "viem/chains";

interface WalletBalances {
  total: number;
  balances: Record<string, number>;
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
  const [isLoading, setIsLoading] = useState(false);

  // Hook for CNGN rate to correct total balances
  const { rate: cngnRate } = useCNGNRate({
    network: selectedNetwork.chain.name,
    dependencies: [selectedNetwork],
  });

  // Check migration status
  const { isMigrationComplete } = useMigrationStatus();

  const fetchBalances = async () => {
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

        // After migration, prioritize embedded wallet (EOA) over smart wallet
        if (isMigrationComplete && embeddedWalletAccount) {
          // Migration complete: Fetch balance for migrated EOA
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
          // Clear smart wallet balance since it's deprecated
          setSmartWalletBalance(null);
        } else if (smartWalletAccount) {
          // Migration not complete: Fetch balance for old SCW
          const result = await fetchWalletBalance(
            publicClient,
            smartWalletAccount.address,
          );
          // Apply cNGN conversion correction
          const correctedTotal = calculateCorrectedTotalBalance(
            result,
            cngnRate,
          );
          setSmartWalletBalance({
            ...result,
            total: correctedTotal,
          });
          setExternalWalletBalance(null);
        } else {
          setSmartWalletBalance(null);
          setExternalWalletBalance(null);
        }

        // Handle external injected wallets (separate from embedded wallet)
        // Only fetch if it's not the embedded wallet and migration not complete
        if (externalWalletAccount &&
          externalWalletAccount.address !== embeddedWalletAccount?.address &&
          !isMigrationComplete) {
          const result = await fetchWalletBalance(
            publicClient,
            externalWalletAccount.address,
          );
          // Apply cNGN conversion correction
          const correctedTotal = calculateCorrectedTotalBalance(
            result,
            cngnRate,
          );
          setExternalWalletBalance({
            ...result,
            total: correctedTotal,
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
          // Apply cNGN conversion correction
          const correctedTotal = calculateCorrectedTotalBalance(
            result,
            cngnRate,
          );
          setInjectedWalletBalance({
            ...result,
            total: correctedTotal,
          });

          setSmartWalletBalance(null);
          setExternalWalletBalance(null);
        } catch (error) {
          console.error("Error fetching injected wallet balance:", error);
          setInjectedWalletBalance(null);
        }
      }
    } catch (error) {
      console.error("Error fetching balances:", error);
      setSmartWalletBalance(null);
      setExternalWalletBalance(null);
      setInjectedWalletBalance(null);
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

  return (
    <BalanceContext.Provider
      value={{
        smartWalletBalance,
        externalWalletBalance,
        injectedWalletBalance,
        allBalances,
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
