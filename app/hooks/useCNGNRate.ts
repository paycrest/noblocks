"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchRate } from "../api/aggregator";
import { getPreferredRateToken, normalizeNetworkForRateFetch } from "../utils";
import { ERROR_MESSAGES } from "../lib/errorMessages";

// Constants for rate fetching configuration
const CNGN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const PRIMARY_TIMEOUT = 5000; // 5 seconds for primary network attempts
const FALLBACK_TIMEOUT = 3000; // 3 seconds for fallback network attempts
const RELIABLE_NETWORKS = ["Base", "BNB Smart Chain"]; // Most reliable networks for rate fallback

/** NGN↔USD-stable quote corridor for cross-chain balance correction (not tied to selected chain). */
export const CNGN_CROSS_CHAIN_QUOTE_NETWORK = RELIABLE_NETWORKS[0] ?? "Base";
const CNGN_CACHE_KEY = "cngn_last_rate";
const CNGN_CACHE_TIME_KEY = "cngn_cache_time";

type CNGNRateSource =
  | "fresh-cache"
  | "primary"
  | "fallback"
  | "expired-cache"
  | "none";

interface CNGNRateFetchResult {
  rate: number | null;
  source: CNGNRateSource;
}

function getFreshCachedRate(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const cached = localStorage.getItem(CNGN_CACHE_KEY);
  const cacheTime = localStorage.getItem(CNGN_CACHE_TIME_KEY);

  if (cached && cacheTime) {
    const age = Date.now() - Number(cacheTime);
    if (age < CNGN_CACHE_TTL) {
      return Number(cached);
    }
  }

  return null;
}

function getCachedRate(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const cached = localStorage.getItem(CNGN_CACHE_KEY);
  if (cached) {
    return Number(cached);
  }

  return null;
}

function cacheRate(rate: number): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.setItem(CNGN_CACHE_KEY, rate.toString());
  localStorage.setItem(CNGN_CACHE_TIME_KEY, Date.now().toString());
}

function parseRateResponse(
  rateResponse: { data?: unknown } | null | undefined,
): number | null {
  const raw = rateResponse?.data;
  if (raw === undefined || raw === null) {
    return null;
  }

  const numericRate =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;

  if (Number.isFinite(numericRate) && numericRate > 0) {
    return numericRate;
  }

  return null;
}

async function fetchRateWithTimeout(
  network: string,
  timeoutMs: number,
): Promise<number | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const preferredToken = await getPreferredRateToken(network);
    const rateResponse = await fetchRate({
      token: preferredToken,
      amount: 100,
      currency: "NGN",
      network: normalizeNetworkForRateFetch(network),
      side: "sell",
      signal: controller.signal,
    });

    return parseRateResponse(rateResponse);
  } catch (err) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchFallbackRate(primaryNetwork: string): Promise<number | null> {
  const normalizedPrimaryNetwork = normalizeNetworkForRateFetch(primaryNetwork);
  const availableNetworks = RELIABLE_NETWORKS.filter(
    (networkName) =>
      normalizeNetworkForRateFetch(networkName) !== normalizedPrimaryNetwork,
  );

  const fallbackPromises = availableNetworks.map(async (networkName) => {
    const rate = await fetchRateWithTimeout(networkName, FALLBACK_TIMEOUT);
    if (rate !== null) {
      return { network: networkName, rate };
    }
    return null;
  });

  const results = await Promise.allSettled(fallbackPromises);
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      return result.value.rate;
    }
  }

  return null;
}

async function fetchCNGNRateWithFallback(
  network: string,
  options: { bypassCache?: boolean } = {},
): Promise<CNGNRateFetchResult> {
  if (!options.bypassCache) {
    const freshCachedRate = getFreshCachedRate();
    if (freshCachedRate !== null) {
      return { rate: freshCachedRate, source: "fresh-cache" };
    }
  }

  const primaryRate = await fetchRateWithTimeout(network, PRIMARY_TIMEOUT);
  if (primaryRate !== null) {
    cacheRate(primaryRate);
    return { rate: primaryRate, source: "primary" };
  }

  const fallbackRate = await fetchFallbackRate(network);
  if (fallbackRate !== null) {
    cacheRate(fallbackRate);
    return { rate: fallbackRate, source: "fallback" };
  }

  const staleCachedRate = getCachedRate();
  if (staleCachedRate !== null) {
    return { rate: staleCachedRate, source: "expired-cache" };
  }

  return { rate: null, source: "none" };
}

interface UseCNGNRateOptions {
  network: string;
  autoFetch?: boolean;
  dependencies?: any[];
}

interface CNGNRateState {
  rate: number | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Custom hook for fetching CNGN (Nigerian Naira) exchange rates
 * Automatically selects the best supported token for the given network
 *
 * @param options - Configuration options
 * @param options.network - The network name (e.g., "Base", "Arbitrum One")
 * @param options.autoFetch - Whether to automatically fetch on mount and dependency changes (default: true)
 * @param options.dependencies - Additional dependencies that trigger refetch
 * @returns Object containing rate, loading state, error, and refetch function
 */
export function useCNGNRate({
  network,
  autoFetch = true,
  dependencies = [],
}: UseCNGNRateOptions): CNGNRateState {
  const [rate, setRate] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCNGNRate = useCallback(async () => {
    if (!network) {
      setError("Network is required");
      return;
    }

    // Skip rate fetching for Starknet networks (testnet, not supported by aggregator)
    if (network.toLowerCase().includes("starknet")) {
      console.log("Skipping rate fetch for Starknet network:", network);
      setRate(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const result = await fetchCNGNRateWithFallback(network);
    if (result.rate !== null) {
      setRate(result.rate);
      if (result.source === "expired-cache") {
        setError(
          "Rate may be outdated due to connection issues. Please refresh when possible.",
        );
      } else {
        setError(null);
      }
      setIsLoading(false);
      return;
    }

    setRate(null);
    setError(ERROR_MESSAGES.NETWORK);
    setIsLoading(false);
  }, [network]);

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    if (autoFetch) {
      fetchCNGNRate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch, fetchCNGNRate, ...dependencies]);

  return {
    rate,
    isLoading,
    error,
    refetch: fetchCNGNRate,
  };
}

/**
 * Utility function to get CNGN rate without the hook (for use in utility functions)
 * This is useful for places like fetchWalletBalance where hooks can't be used
 *
 * @param network - The network name
 * @returns Promise that resolves to the CNGN rate or null if failed
 */
export async function getCNGNRateForNetwork(
  network: string,
  options: { bypassCache?: boolean } = {},
): Promise<number | null> {
  if (!network) return null;
  if (network.toLowerCase().includes("starknet")) {
    return null;
  }
  const result = await fetchCNGNRateWithFallback(network, options);
  return result.rate;
}
