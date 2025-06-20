"use client";
import {
  createContext,
  useContext,
  useState,
  type FC,
  type ReactNode,
  useCallback,
} from "react";
import { createPublicClient, http } from "viem";
import { networks } from "../mocks";
import { fetchWalletBalance, getRpcUrl } from "../utils";
import { bsc } from "viem/chains";

export interface NetworkBalance {
  networkName: string;
  networkLogo: string | { light: string; dark: string };
  total: number;
  balances: Record<string, number>;
  isLoading: boolean;
  error?: string;
}

interface MultiNetworkBalanceContextProps {
  fetchAllNetworkBalances: (
    address: string,
  ) => Promise<NetworkBalance[] | undefined>;
  networkBalances: NetworkBalance[];
  isLoading: boolean;
}

const MultiNetworkBalanceContext = createContext<
  MultiNetworkBalanceContextProps | undefined
>(undefined);

export const MultiNetworkBalanceProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [networkBalances, setNetworkBalances] = useState<NetworkBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAllNetworkBalances = useCallback(async (address: string) => {
    setIsLoading(true);

    // Initialize balances array with loading states
    setNetworkBalances(
      networks.map((network) => ({
        networkName: network.chain.name,
        networkLogo: network.imageUrl,
        total: 0,
        balances: {},
        isLoading: true,
      })),
    );

    try {
      // Create fetch promises for each network
      const balancePromises = networks.map(async (network) => {
        try {
          const publicClient = createPublicClient({
            chain: network.chain,
            transport: http(
              network.chain.id === bsc.id
                ? "https://bsc-dataseed.bnbchain.org/"
                : getRpcUrl(network.chain.name),
            ),
          });

          const result = await fetchWalletBalance(publicClient, address);

          return {
            networkName: network.chain.name,
            networkLogo: network.imageUrl,
            ...result,
            isLoading: false,
          };
        } catch (error) {
          console.error(
            `Error fetching balances for ${network.chain.name}:`,
            error,
          );
          return {
            networkName: network.chain.name,
            networkLogo: network.imageUrl,
            total: 0,
            balances: {},
            isLoading: false,
            error: "Failed to fetch balances",
          };
        }
      });

      // Wait for all promises to resolve
      const results = await Promise.all(balancePromises);

      // Update state with results
      setNetworkBalances(results);
      return results;
    } catch (error) {
      console.error("Error fetching all network balances:", error);
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <MultiNetworkBalanceContext.Provider
      value={{
        fetchAllNetworkBalances,
        networkBalances,
        isLoading,
      }}
    >
      {children}
    </MultiNetworkBalanceContext.Provider>
  );
};

export const useMultiNetworkBalance = () => {
  const context = useContext(MultiNetworkBalanceContext);
  if (!context) {
    throw new Error(
      "useMultiNetworkBalance must be used within a MultiNetworkBalanceProvider",
    );
  }
  return context;
};
