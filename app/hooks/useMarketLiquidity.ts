"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchMarkets } from "../api/aggregator";
import {
  computeLiquidityEnvelope,
  envelopesEqual,
  type LiquidityEnvelope,
} from "../lib/marketLiquidity";
import { toAggregatorToken } from "../lib/token-symbol";
import type { RateSide } from "../types";
import { normalizeNetworkForRateFetch } from "../utils";

/** Matches the aggregator's ~10s book cache; polling faster only adds load. */
const POLL_INTERVAL_MS = 12_000;

interface UseMarketLiquidityOptions {
  /** Off while the corridor is incomplete or the side can't be quoted. */
  enabled: boolean;
  side: RateSide;
  /** Display symbol; converted to the aggregator wire form internally. */
  token: string;
  currency: string;
  /** Display network name, e.g. "Base". */
  networkName: string;
}

interface MarketLiquidityState {
  /** `null` means unknown — callers keep their static limits. */
  envelope: LiquidityEnvelope | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Tracks the range of amounts providers can currently fill for one corridor,
 * so the form's limits reflect live capacity instead of a fixed ceiling.
 *
 * Failures are deliberately quiet: the rate request already surfaces provider
 * problems to the user, and this hook returning `null` simply restores the
 * previous static-limit behavior.
 */
export function useMarketLiquidity({
  enabled,
  side,
  token,
  currency,
  networkName,
}: UseMarketLiquidityOptions): MarketLiquidityState {
  const [envelope, setEnvelope] = useState<LiquidityEnvelope | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards a late response from overwriting a newer corridor's data. This
  // stands in for cancellation on purpose: `fetchMarkets` dedupes concurrent
  // callers onto one shared promise, so aborting on cleanup would cancel a
  // request that a re-mount or a quick corridor flip-flop is about to await.
  // The request itself is small and its result is cached for the next caller.
  const requestSeq = useRef(0);
  const hasEnvelopeRef = useRef(false);

  const wireToken = toAggregatorToken(token);
  const wireCurrency = (currency || "").trim().toUpperCase();
  const wireNetwork = networkName
    ? normalizeNetworkForRateFetch(networkName)
    : "";

  const ready = enabled && Boolean(wireToken && wireCurrency && wireNetwork);

  const load = useCallback(async () => {
    if (!ready) return;

    const seq = requestSeq.current;
    if (!hasEnvelopeRef.current) setIsLoading(true);

    try {
      const offers = await fetchMarkets({
        side,
        token: wireToken,
        currency: wireCurrency,
        network: wireNetwork,
      });
      if (seq !== requestSeq.current) return;

      const next = computeLiquidityEnvelope(offers, side);
      hasEnvelopeRef.current = next !== null;
      setEnvelope((prev) => (envelopesEqual(prev, next) ? prev : next));
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      // Keep the last good band through a transient failure; it is closer to
      // the truth than snapping back to the static limits mid-session.
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (seq === requestSeq.current) setIsLoading(false);
    }
  }, [ready, side, wireToken, wireCurrency, wireNetwork]);

  useEffect(() => {
    // Invalidate anything still in flight for the previous corridor.
    requestSeq.current += 1;
    hasEnvelopeRef.current = false;

    if (!ready) {
      setEnvelope(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    // A band from the previous corridor must never validate this one.
    setEnvelope(null);

    load();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      requestSeq.current += 1;
    };
  }, [ready, load]);

  return { envelope, isLoading, error, refetch: load };
}
