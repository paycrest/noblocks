"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TokenHistoryRange } from "@/app/lib/tokens/market-id";
import type {
  ClientTokenHistoryResponse,
  ClientTokenMarketSnapshot,
} from "@/app/lib/tokens/market-types";

type MarketSnapshotState = {
  data: ClientTokenMarketSnapshot | null;
  isLoading: boolean;
  error: boolean;
  unavailable: boolean;
};

export function useTokenMarketSnapshot(
  marketId: string | null,
  options?: { enabled?: boolean },
): MarketSnapshotState & { refetch: () => Promise<void> } {
  const enabled = (options?.enabled ?? true) && Boolean(marketId);
  const [data, setData] = useState<ClientTokenMarketSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const requestIdRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!marketId || !enabled) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(false);
    setUnavailable(false);

    try {
      const response = await fetch(`/api/market/tokens/${marketId}`, {
        credentials: "same-origin",
      });
      if (requestId !== requestIdRef.current) return;

      if (response.status === 503) {
        setData(null);
        setUnavailable(true);
        return;
      }

      if (!response.ok) {
        setData(null);
        setError(true);
        return;
      }

      const body = (await response.json()) as {
        success: boolean;
        data?: ClientTokenMarketSnapshot;
      };
      if (!body.success || !body.data) {
        setData(null);
        setError(true);
        return;
      }
      setData(body.data);
      if (!body.data.change24h) {
        setUnavailable(true);
      }
    } catch {
      if (requestId !== requestIdRef.current) return;
      setData(null);
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, marketId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, unavailable, refetch };
}

type HistoryState = {
  data: ClientTokenHistoryResponse | null;
  isLoading: boolean;
  error: boolean;
  unavailable: boolean;
};

export function useTokenMarketHistory(
  marketId: string | null,
  range: TokenHistoryRange,
  options?: { enabled?: boolean },
): HistoryState & { refetch: () => Promise<void> } {
  const enabled = (options?.enabled ?? true) && Boolean(marketId);
  const [data, setData] = useState<ClientTokenHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const requestIdRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!marketId || !enabled) return;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(false);
    setUnavailable(false);

    try {
      const response = await fetch(
        `/api/market/tokens/${marketId}/history?range=${range}`,
        { credentials: "same-origin" },
      );
      if (requestId !== requestIdRef.current) return;

      if (response.status === 503) {
        const body = (await response.json()) as {
          data?: ClientTokenHistoryResponse;
        };
        setData(body.data ?? null);
        setUnavailable(true);
        return;
      }

      if (!response.ok) {
        setData(null);
        setError(true);
        return;
      }

      const body = (await response.json()) as {
        success: boolean;
        data?: ClientTokenHistoryResponse;
      };
      if (!body.success || !body.data) {
        setData(null);
        setError(true);
        return;
      }
      setData(body.data);
      if (body.data.unavailable || body.data.points.length === 0) {
        setUnavailable(true);
      }
    } catch {
      if (requestId !== requestIdRef.current) return;
      setData(null);
      setError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, marketId, range]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, unavailable, refetch };
}

export function useTokenMarketQuotes(
  marketIds: string[],
  options?: { enabled?: boolean },
): {
  quotesById: Record<string, { pct: string | null; unavailable: boolean }>;
  isLoading: boolean;
} {
  const enabled = options?.enabled ?? true;
  const [quotesById, setQuotesById] = useState<
    Record<string, { pct: string | null; unavailable: boolean }>
  >({});
  const [isLoading, setIsLoading] = useState(enabled && marketIds.length > 0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || marketIds.length === 0) {
      setQuotesById({});
      setIsLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    void (async () => {
      const entries = await Promise.all(
        marketIds.map(async (id) => {
          try {
            const response = await fetch(`/api/market/tokens/${id}`, {
              credentials: "same-origin",
            });
            if (!response.ok) {
              return [id, { pct: null, unavailable: true }] as const;
            }
            const body = (await response.json()) as {
              success: boolean;
              data?: ClientTokenMarketSnapshot;
            };
            if (!body.success || !body.data?.change24h) {
              return [id, { pct: null, unavailable: true }] as const;
            }
            return [
              id,
              {
                pct: body.data.change24h.pct,
                unavailable: false,
              },
            ] as const;
          } catch {
            return [id, { pct: null, unavailable: true }] as const;
          }
        }),
      );

      if (requestId !== requestIdRef.current) return;
      setQuotesById(Object.fromEntries(entries));
      setIsLoading(false);
    })();
  }, [enabled, marketIds.join(",")]);

  return { quotesById, isLoading };
}
