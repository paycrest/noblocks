"use client";
import { useState, useEffect, useCallback } from "react";
import { fetchRate } from "../api/aggregator";
import { getPreferredRateToken, normalizeNetworkForRateFetch } from "../utils";
import { networks } from "../mocks";

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
  const [lastSuccessfulRate, setLastSuccessfulRate] = useState<number | null>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('cngn_last_rate');
      return cached ? Number(cached) : null;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCNGNRate = useCallback(async () => {
    if (!network) {
      setError("Network is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    // Fast path: Check fresh cache first (TTL: 5 minutes)
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('cngn_last_rate');
      const cacheTime = localStorage.getItem('cngn_cache_time');

      if (cached && cacheTime) {
        const age = Date.now() - Number(cacheTime);
        const fiveMinutes = 5 * 60 * 1000;

        if (age < fiveMinutes) {
          const cachedRate = Number(cached);
          setRate(cachedRate);
          setLastSuccessfulRate(cachedRate);
          setIsLoading(false);
          console.log("Using fresh cached CNGN rate:", cachedRate);
          return;
        }
      }
    }

    // Primary attempt: Try current network with timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const preferredToken = await getPreferredRateToken(network);
      const rateResponse = await fetchRate({
        token: preferredToken,
        amount: 100,
        currency: "NGN",
        network: normalizeNetworkForRateFetch(network),
      });

      clearTimeout(timeoutId);

      if (rateResponse?.data && typeof rateResponse.data === "string") {
        const numericRate = Number(rateResponse.data);
        if (numericRate > 0) {
          setRate(numericRate);
          setLastSuccessfulRate(numericRate);
          // Cache with timestamp
          if (typeof window !== 'undefined') {
            localStorage.setItem('cngn_last_rate', numericRate.toString());
            localStorage.setItem('cngn_cache_time', Date.now().toString());
          }
          setError(null);
          setIsLoading(false);
          console.log(`Successfully fetched CNGN rate from ${network}: ${numericRate}`);
          return;
        }
      }
      throw new Error("Invalid rate data");
    } catch (err) {
      console.warn(`Primary network ${network} failed:`, err);
    }

    // Optimized parallel fallback: Try 2 most reliable networks simultaneously
    const reliableNetworks = ['base', 'bnb']; // Prioritize stable networks
    const availableNetworks = reliableNetworks.filter(net => net !== network.toLowerCase());

    const fallbackPromises = availableNetworks.map(async (networkName) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout for fallbacks

        const preferredToken = await getPreferredRateToken(networkName);
        const rateResponse = await fetchRate({
          token: preferredToken,
          amount: 100,
          currency: "NGN",
          network: normalizeNetworkForRateFetch(networkName),
        });

        clearTimeout(timeoutId);

        if (rateResponse?.data && typeof rateResponse.data === "string") {
          const numericRate = Number(rateResponse.data);
          if (numericRate > 0) {
            return { network: networkName, rate: numericRate };
          }
        }
        return null;
      } catch (err) {
        console.warn(`Fallback network ${networkName} failed:`, err);
        return null;
      }
    });

    // Race condition: First successful response wins
    try {
      const results = await Promise.allSettled(fallbackPromises);
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const { network: successfulNetwork, rate } = result.value;
          setRate(rate);
          setLastSuccessfulRate(rate);
          // Cache with timestamp
          if (typeof window !== 'undefined') {
            localStorage.setItem('cngn_last_rate', rate.toString());
            localStorage.setItem('cngn_cache_time', Date.now().toString());
          }
          setError(null);
          setIsLoading(false);
          console.log(`Successfully fetched CNGN rate from fallback ${successfulNetwork}: ${rate}`);
          return;
        }
      }
    } catch (err) {
      console.warn('Parallel fallback failed:', err);
    }

    // Ultimate fallback: Use expired cached rate if available
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('cngn_last_rate');
      if (cached) {
        const cachedRate = Number(cached);
        setRate(cachedRate);
        setLastSuccessfulRate(cachedRate);
        setError("Using outdated cached rate (network issues - please refresh)");
        setIsLoading(false);
        console.log("Using expired cached CNGN rate:", cachedRate);
        return;
      }
    }

    // Complete failure
    setRate(null);
    setError("Unable to fetch CNGN rate - please check your internet connection");
    setIsLoading(false);
    console.error("Complete CNGN rate fetch failure");
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
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem('cngn_last_rate');
    const cacheTime = localStorage.getItem('cngn_cache_time');

    if (cached && cacheTime) {
      const age = Date.now() - Number(cacheTime);
      const fiveMinutes = 5 * 60 * 1000;

      if (age < fiveMinutes) {
        const cachedRate = Number(cached);
        console.log("Using fresh cached CNGN rate in getCNGNRateForNetwork:", cachedRate);
        return cachedRate;
      }
    }
  }

  // Primary attempt: Try requested network with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const preferredToken = await getPreferredRateToken(network);
    const rateResponse = await fetchRate({
      token: preferredToken,
      amount: 100,
      currency: "NGN",
      network: normalizeNetworkForRateFetch(network),
    });

    clearTimeout(timeoutId);

    if (rateResponse?.data && typeof rateResponse.data === "string") {
      const numericRate = Number(rateResponse.data);
      if (numericRate > 0) {
        // Cache successful rate
        if (typeof window !== 'undefined') {
          localStorage.setItem('cngn_last_rate', numericRate.toString());
          localStorage.setItem('cngn_cache_time', Date.now().toString());
        }
        console.log(`Successfully fetched CNGN rate from ${network}: ${numericRate}`);
        return numericRate;
      }
    }
  } catch (err) {
    console.warn(`Primary network ${network} failed in getCNGNRateForNetwork:`, err);
  }

  // Parallel fallback: Try 2 reliable networks simultaneously
  const reliableNetworks = ['base', 'bnb'];
  const availableNetworks = reliableNetworks.filter(net => net !== network.toLowerCase());

  const fallbackPromises = availableNetworks.map(async (networkName) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const preferredToken = await getPreferredRateToken(networkName);
      const rateResponse = await fetchRate({
        token: preferredToken,
        amount: 100,
        currency: "NGN",
        network: normalizeNetworkForRateFetch(networkName),
      });

      clearTimeout(timeoutId);

      if (rateResponse?.data && typeof rateResponse.data === "string") {
        const numericRate = Number(rateResponse.data);
        if (numericRate > 0) {
          return { network: networkName, rate: numericRate };
        }
      }
      return null;
    } catch (err) {
      console.warn(`Fallback network ${networkName} failed in getCNGNRateForNetwork:`, err);
      return null;
    }
  });

  try {
    const results = await Promise.allSettled(fallbackPromises);
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { network: successfulNetwork, rate } = result.value;
        // Cache successful rate
        if (typeof window !== 'undefined') {
          localStorage.setItem('cngn_last_rate', rate.toString());
          localStorage.setItem('cngn_cache_time', Date.now().toString());
        }
        console.log(`Successfully fetched CNGN rate from fallback ${successfulNetwork}: ${rate}`);
        return rate;
      }
    }
  } catch (err) {
    console.warn('Parallel fallback failed in getCNGNRateForNetwork:', err);
  }

  // Ultimate fallback: Use expired cached rate
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem('cngn_last_rate');
    if (cached) {
      const cachedRate = Number(cached);
      console.log("Using expired cached CNGN rate in getCNGNRateForNetwork:", cachedRate);
      return cachedRate;
    }
  }

  console.error("No CNGN rate available in getCNGNRateForNetwork");
  return null;
}
