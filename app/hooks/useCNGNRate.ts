import { useState, useEffect, useCallback } from "react";
import { fetchRate } from "../api/aggregator";
import { getPreferredRateToken } from "../utils";

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

    try {
      // Get the preferred token for this network dynamically
      const preferredToken = await getPreferredRateToken(network);
      
      const rateResponse = await fetchRate({
        token: preferredToken,
        amount: 1,
        currency: "NGN",
        network: network.toLowerCase().replace(/\s+/g, "-"),
      });

      if (rateResponse?.data && typeof rateResponse.data === "string") {
        const numericRate = Number(rateResponse.data);
        if (numericRate > 0) {
          setRate(numericRate);
          setError(null);
        } else {
          throw new Error("Invalid rate received");
        }
      } else {
        throw new Error("No rate data received");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      console.error("Error fetching CNGN rate:", err);
    } finally {
      setIsLoading(false);
    }
  }, [network]);

  // Auto-fetch on mount and when dependencies change
  useEffect(() => {
    if (autoFetch) {
      fetchCNGNRate();
    }
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
export async function getCNGNRateForNetwork(network: string): Promise<number | null> {
  try {
    if (!network) return null;

    const preferredToken = await getPreferredRateToken(network);
    
    const rateResponse = await fetchRate({
      token: preferredToken,
      amount: 1,
      currency: "NGN",
      network: network.toLowerCase().replace(/\s+/g, "-"),
    });

    if (rateResponse?.data && typeof rateResponse.data === "string") {
      const numericRate = Number(rateResponse.data);
      return numericRate > 0 ? numericRate : null;
    }
    
    return null;
  } catch (error) {
    console.error("Error fetching CNGN rate for network:", error);
    return null;
  }
}
