import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { fetchWalletBalance, getRpcUrl } from "../utils";
import { useNetwork } from "./NetworksContext";
import { createPublicClient, http } from "viem";
import { useInjectedWallet } from "./InjectedWalletContext";
import { bsc } from "viem/chains";
import { useActiveAccount } from "thirdweb/react";

interface WalletBalances {
  total: number;
  balances: Record<string, number>;
}

interface BalanceContextProps {
  smartWalletBalance: WalletBalances | null;
  injectedWalletBalance: WalletBalances | null;
  allBalances: {
    smartWallet: WalletBalances | null;
    injectedWallet: WalletBalances | null;
  };
  refreshBalance: () => void;
  isLoading: boolean;
}

const BalanceContext = createContext<BalanceContextProps | undefined>(
  undefined,
);

export const BalanceProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { selectedNetwork } = useNetwork();
  const { isInjectedWallet, injectedAddress, injectedReady, injectedProvider } =
    useInjectedWallet();

  // Only use thirdweb account when not in injected wallet mode
  const account = !isInjectedWallet ? useActiveAccount() : null;
  const isAuthenticated = !isInjectedWallet ? !!account : false;

  const [smartWalletBalance, setSmartWalletBalance] =
    useState<WalletBalances | null>(null);
  const [injectedWalletBalance, setInjectedWalletBalance] =
    useState<WalletBalances | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    setIsLoading(true);

    try {
      if (
        isInjectedWallet &&
        injectedReady &&
        injectedAddress &&
        injectedProvider
      ) {
        // Handle injected wallet mode
        const publicClient = createPublicClient({
          chain: selectedNetwork.chain,
          transport: http(getRpcUrl(selectedNetwork.chain.name)),
        });

        const result = await fetchWalletBalance(publicClient, injectedAddress);
        setInjectedWalletBalance(result);
        setSmartWalletBalance(null);
      } else if (isAuthenticated && account) {
        // Handle thirdweb mode
        const publicClient = createPublicClient({
          chain: selectedNetwork.chain,
          transport: http(
            selectedNetwork.chain.id === bsc.id
              ? "https://bsc-dataseed.bnbchain.org/"
              : getRpcUrl(selectedNetwork.chain.name),
          ),
        });

        const result = await fetchWalletBalance(publicClient, account.address);
        setSmartWalletBalance(result);
        setInjectedWalletBalance(null);
      } else {
        // No wallet connected
        setSmartWalletBalance(null);
        setInjectedWalletBalance(null);
      }
    } catch (e) {
      const fetchError = e as Error;
      setSmartWalletBalance(null);
      setInjectedWalletBalance(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    isInjectedWallet,
    injectedReady,
    injectedAddress,
    injectedProvider,
    selectedNetwork,
    isAuthenticated,
    account,
  ]);

  // Initial fetch and network change
  useEffect(() => {
    if (isAuthenticated || (isInjectedWallet && injectedReady)) {
      fetchBalances();
    }
  }, [isAuthenticated, isInjectedWallet, injectedReady, fetchBalances]);

  const allBalances = {
    smartWallet: smartWalletBalance,
    injectedWallet: injectedWalletBalance,
  };

  return (
    <BalanceContext.Provider
      value={{
        smartWalletBalance,
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
