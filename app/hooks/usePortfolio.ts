"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApiAuth } from "./useApiAuth";
import {
  fetchPortfolioSummary,
  PortfolioFetchError,
} from "@/app/lib/portfolio/client";
import type { PortfolioSummary } from "@/app/lib/portfolio/types";

export type UsePortfolioResult = {
  data: PortfolioSummary | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
};

export function usePortfolio(options?: { enabled?: boolean }): UsePortfolioResult {
  const enabled = options?.enabled ?? true;
  const { resolveAuth } = useApiAuth();
  const [data, setData] = useState<PortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const auth = await resolveAuth({ interactive: false });
      if (!auth.accessToken && !auth.injectedToken) {
        throw new PortfolioFetchError("Unauthorized", 401);
      }
      const summary = await fetchPortfolioSummary(auth);
      if (requestId !== requestIdRef.current) return;
      setData(summary);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err : new Error("Unable to load portfolio"));
      setData(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, resolveAuth]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}
