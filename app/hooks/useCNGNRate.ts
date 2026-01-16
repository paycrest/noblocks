"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchRate } from "../api/aggregator";
import { getPreferredRateToken, normalizeNetworkForRateFetch } from "../utils";

// Constants for rate fetching configuration
const CNGN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const PRIMARY_TIMEOUT = 5000; // 5 seconds for primary network attempts
const FALLBACK_TIMEOUT = 3000; // 3 seconds for fallback network attempts
const RELIABLE_NETWORKS = ["base", "bnb"]; // Most reliable networks for rate fallback

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

    setIsLoading(true);
    setError(null);

    // Fast path: Check fresh cache first
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("cngn_last_rate");
      const cacheTime = localStorage.getItem("cngn_cache_time");

      if (cached && cacheTime) {
        const age = Date.now() - Number(cacheTime);

        if (age < CNGN_CACHE_TTL) {
          const cachedRate = Number(cached);
          setRate(cachedRate);
          setIsLoading(false);
          return;
        }
      }
    }

    // Primary attempt: Try current network with timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PRIMARY_TIMEOUT);

      try {
        const preferredToken = await getPreferredRateToken(network);
        const rateResponse = await fetchRate({
          token: preferredToken,
          amount: 100,
          currency: "NGN",
          network: normalizeNetworkForRateFetch(network),
          signal: controller.signal,
        });

        if (rateResponse?.data && typeof rateResponse.data === "string") {
          const numericRate = Number(rateResponse.data);
          if (numericRate > 0) {
            setRate(numericRate);
            // Cache with timestamp
            if (typeof window !== "undefined") {
              localStorage.setItem("cngn_last_rate", numericRate.toString());
              localStorage.setItem("cngn_cache_time", Date.now().toString());
            }
            setError(null);
            setIsLoading(false);
            return;
          }
        }
        throw new Error("Invalid rate data");
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      // Continue to fallback on error
    }

    // Fallback: Try most reliable networks - use first successful result
    const availableNetworks = RELIABLE_NETWORKS.filter(
      (net) => net !== network.toLowerCase(),
    );

    const fallbackPromises = availableNetworks.map(async (networkName) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT);

      try {
        const preferredToken = await getPreferredRateToken(networkName);
        const rateResponse = await fetchRate({
          token: preferredToken,
          amount: 100,
          currency: "NGN",
          network: normalizeNetworkForRateFetch(networkName),
          signal: controller.signal,
        });

        if (rateResponse?.data && typeof rateResponse.data === "string") {
          const numericRate = Number(rateResponse.data);
          if (numericRate > 0) {
            return { network: networkName, rate: numericRate };
          }
        }
        return null;
      } catch (err) {
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    });

    // Use first successful result from fallback attempts
    try {
      const results = await Promise.allSettled(fallbackPromises);
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          const { network: successfulNetwork, rate } = result.value;
          setRate(rate);
          // Cache with timestamp
          if (typeof window !== "undefined") {
            localStorage.setItem("cngn_last_rate", rate.toString());
            localStorage.setItem("cngn_cache_time", Date.now().toString());
          }
          setError(null);
          setIsLoading(false);
          return;
        }
      }
    } catch (err) {
      // Continue to ultimate fallback on error
    }

    // Ultimate fallback: Use expired cached rate if available
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("cngn_last_rate");
      if (cached) {
        const cachedRate = Number(cached);
        setRate(cachedRate);
        setError(
          "Using outdated cached rate (network issues - please refresh)",
        );
        setIsLoading(false);
        return;
      }
    }

    // Complete failure
    setRate(null);
    setError(
      "Unable to fetch CNGN rate - please check your internet connection",
    );
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
): Promise<number | null> {
  // Fast path: Check fresh cache first
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem("cngn_last_rate");
    const cacheTime = localStorage.getItem("cngn_cache_time");

    if (cached && cacheTime) {
      const age = Date.now() - Number(cacheTime);

      if (age < CNGN_CACHE_TTL) {
        const cachedRate = Number(cached);
        return cachedRate;
      }
    }
  }

  // Primary attempt: Try requested network with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PRIMARY_TIMEOUT);

    try {
      const preferredToken = await getPreferredRateToken(network);
      const rateResponse = await fetchRate({
        token: preferredToken,
        amount: 100,
        currency: "NGN",
        network: normalizeNetworkForRateFetch(network),
        signal: controller.signal,
      });

      if (rateResponse?.data && typeof rateResponse.data === "string") {
        const numericRate = Number(rateResponse.data);
        if (numericRate > 0) {
          // Cache successful rate
          if (typeof window !== "undefined") {
            localStorage.setItem("cngn_last_rate", numericRate.toString());
            localStorage.setItem("cngn_cache_time", Date.now().toString());
          }
          return numericRate;
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    // Continue to fallback on error
  }

  // Fallback: Try most reliable networks - use first successful result
  const availableNetworks = RELIABLE_NETWORKS.filter(
    (net) => net !== network.toLowerCase(),
  );

  const fallbackPromises = availableNetworks.map(async (networkName) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FALLBACK_TIMEOUT);

    try {
      const preferredToken = await getPreferredRateToken(networkName);
      const rateResponse = await fetchRate({
        token: preferredToken,
        amount: 100,
        currency: "NGN",
        network: normalizeNetworkForRateFetch(networkName),
        signal: controller.signal,
      });

      if (rateResponse?.data && typeof rateResponse.data === "string") {
        const numericRate = Number(rateResponse.data);
        if (numericRate > 0) {
          return { network: networkName, rate: numericRate };
        }
      }
      return null;
    } catch (err) {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  });

  try {
    const results = await Promise.allSettled(fallbackPromises);
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        const { network: successfulNetwork, rate } = result.value;
        // Cache successful rate
        if (typeof window !== "undefined") {
          localStorage.setItem("cngn_last_rate", rate.toString());
          localStorage.setItem("cngn_cache_time", Date.now().toString());
        }
        return rate;
      }
    }
  } catch (err) {
    // Continue to ultimate fallback on error
  }

  // Ultimate fallback: Use expired cached rate
  if (typeof window !== "undefined") {
    const cached = localStorage.getItem("cngn_last_rate");
    if (cached) {
      const cachedRate = Number(cached);
      return cachedRate;
    }
  }

  return null;
}
