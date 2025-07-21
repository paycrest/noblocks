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

  const refreshTokens = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Make a single API call to get all tokens
      const apiTokens = await fetchTokens();

      // Group tokens by network and map to our format
      const newTokens: { [network: string]: Token[] } = {};

      apiTokens.forEach((apiToken: APIToken) => {
        const networkName = normalizeNetworkName(apiToken.network);
        if (!newTokens[networkName]) {
          newTokens[networkName] = [];
        }
        newTokens[networkName].push(transformToken(apiToken));
      });

      setAllTokens(newTokens);
    } catch (err) {
      console.error("Failed to fetch tokens from API, using fallback:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch tokens");
      // Use fallback tokens if API fails
      setAllTokens(FALLBACK_TOKENS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshTokens();
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
