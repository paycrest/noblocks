"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { fetchTokens } from "../api/aggregator";
import {
  normalizeNetworkName,
  transformToken,
  FALLBACK_TOKENS,
} from "../utils";
import type { Token, APIToken } from "../types";

interface TokensContextType {
  allTokens: { [network: string]: Token[] };
  isLoading: boolean;
  error: string | null;
  refreshTokens: () => Promise<void>;
}

const TokensContext = createContext<TokensContextType | undefined>(undefined);

export function TokensProvider({ children }: { children: ReactNode }) {
  const [allTokens, setAllTokens] = useState<{
    [network: string]: Token[];
  }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(true);

  const refreshTokens = async () => {
    if (!isMounted) return;
    setIsLoading(true);
    setError(null);
    try {
      // Make a single API call to get all tokens
      const apiTokens = await fetchTokens();
      if (!isMounted) return;
      // Group tokens by network and map to our format
      const newTokens = apiTokens.reduce<{ [network: string]: Token[] }>(
        (acc, apiToken) => {
          const networkName = normalizeNetworkName(apiToken.network);
          if (!acc[networkName]) {
            acc[networkName] = [];
          }
          acc[networkName].push(transformToken(apiToken));
          return acc;
        },
        {},
      );
      // Temporarily add USDT on Base for user withdrawal
      if (newTokens["Base"]) {
        const usdtBase = {
          name: "Tether USD",
          symbol: "USDT",
          decimals: 6,
          address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
          imageUrl: "/logos/usdt-logo.svg",
        };

        // Check if USDT is not already in the list
        const hasUSDT = newTokens["Base"].some(
          (token) => token.symbol === "USDT",
        );
        if (!hasUSDT) {
          newTokens["Base"].push(usdtBase);
        }
      }

      // Manually add Ethereum tokens since aggregator doesn't support it yet
      if (!newTokens["Ethereum"]) {
        newTokens["Ethereum"] = [
          {
            name: "USD Coin",
            symbol: "USDC",
            decimals: 6,
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            imageUrl: "/logos/usdc-logo.svg",
          },
          {
            name: "Tether USD",
            symbol: "USDT",
            decimals: 6,
            address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            imageUrl: "/logos/usdt-logo.svg",
          },
          {
            name: "Dai Stablecoin",
            symbol: "DAI",
            decimals: 18,
            address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
            imageUrl: "/logos/dai-logo.svg",
          },
        ];
      }

      setAllTokens(newTokens);
    } catch (err) {
      console.error("Failed to fetch tokens from API, using fallback:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch tokens");
      // Use fallback tokens if API fails
      if (isMounted) {
        setAllTokens(FALLBACK_TOKENS);
      }
    } finally {
      if (isMounted) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    refreshTokens();
    return () => {
      setIsMounted(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TokensContext.Provider
      value={{ allTokens, isLoading, error, refreshTokens }}
    >
      {children}
    </TokensContext.Provider>
  );
}

export function useTokens() {
  const context = useContext(TokensContext);
  if (!context) {
    throw new Error("useTokens must be used within a TokensProvider");
  }
  return context;
}
