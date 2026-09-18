"use client";

/**
 * Noblocks Play — react-query data hooks. All Privy-authenticated calls get
 * a fresh access token per request (getAccessToken handles refresh), same
 * pattern as the referral hub (ReferralModal / getReferralData).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getReferralData } from "@/app/api/aggregator";
import {
  PlayApiError,
  checkUsername,
  fetchLeaderboard,
  fetchManager,
  fetchMatchday,
  fetchMatchdays,
  fetchPlayers,
  fetchRewards,
  fetchSquad,
  joinLeague,
  makeTransfers,
  saveSquad,
} from "./api";
import { playPollIntervalMs } from "@/app/lib/fantasy/fixture-activity";
import type {
  SaveSquadBody,
  SquadResponse,
  TransfersBody,
  UsernameCheckResponse,
} from "./types";

export const playKeys = {
  players: ["play", "players"] as const,
  squad: ["play", "squad"] as const,
  rewards: ["play", "rewards"] as const,
  referralData: ["play", "referral-data"] as const,
  leaderboard: (page: number, findMe: boolean, authed: boolean) =>
    ["play", "leaderboard", page, findMe, authed] as const,
  matchday: (id: number | string) => ["play", "matchday", id] as const,
  manager: (username: string) => ["play", "manager", username] as const,
};

/** Public view of a manager's team (latest locked round only). */
export function useManagerTeam(username: string | null | undefined) {
  return useQuery({
    queryKey: playKeys.manager(username ?? ""),
    queryFn: () => fetchManager(username!),
    enabled: Boolean(username),
    staleTime: 60_000,
    refetchInterval: false,
  });
}

/** Public player pool + builder settings + current matchday. */
export function usePlayersPool() {
  return useQuery({
    queryKey: playKeys.players,
    queryFn: fetchPlayers,
    staleTime: 5 * 60_000,
  });
}

export function useMatchday(id: number | string) {
  return useQuery({
    queryKey: playKeys.matchday(id),
    queryFn: () => fetchMatchday(id),
    staleTime: 10_000,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      return playPollIntervalMs(data.matchday.status, data.fixtures);
    },
  });
}

export function useMatchdays() {
  return useQuery({
    queryKey: [...playKeys.matchday("all")],
    queryFn: fetchMatchdays,
    staleTime: 60_000,
    refetchInterval: false,
  });
}

export function useLeaderboard(page: number, findMe = false) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  return useQuery({
    queryKey: playKeys.leaderboard(page, findMe, authenticated),
    queryFn: async () =>
      fetchLeaderboard({
        page,
        findMe,
        token: authenticated ? await getAccessToken() : null,
      }),
    // findMe only makes sense once signed in — skip the request entirely
    // for anonymous visits instead of issuing a tokenless findMe lookup.
    enabled: ready && (!findMe || authenticated),
    // Page changes are their own query key, so without this the table would
    // unmount into skeletons on every Prev/Next. Hold the previous page's rows
    // until the new ones arrive; callers dim the table via isFetching instead.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchInterval: false,
  });
}

/**
 * Own squad for the current matchday. Also doubles as the "have I joined?"
 * probe: a 403 NOT_JOINED error means authed-but-not-joined.
 */
export function useSquad() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  return useQuery({
    queryKey: playKeys.squad,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new PlayApiError("Unauthorized", 401);
      return fetchSquad(token);
    },
    enabled: ready && authenticated,
    retry: (failureCount, error) =>
      !(error instanceof PlayApiError && error.status < 500) &&
      failureCount < 2,
    staleTime: 10_000,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      if (data.game_active) return 15_000;
      return playPollIntervalMs(data.matchday?.status, undefined);
    },
  });
}

/** Tri-state join status derived from the squad probe. */
export function useJoinStatus(): {
  ready: boolean;
  authenticated: boolean;
  joined: boolean | undefined;
  squad: SquadResponse | undefined;
  isLoading: boolean;
} {
  const { ready, authenticated } = usePrivy();
  const squadQuery = useSquad();

  const joined = !authenticated
    ? false
    : squadQuery.data
      ? true
      : squadQuery.error instanceof PlayApiError &&
          squadQuery.error.code === "NOT_JOINED"
        ? false
        : undefined; // still loading / unknown

  return {
    ready,
    authenticated,
    joined,
    squad: squadQuery.data,
    // isPending, not isLoading: while Privy initializes the probe query is
    // disabled and isLoading is false, which would flash the wrong CTA.
    isLoading: authenticated && squadQuery.isPending,
  };
}

export function useRewards(enabled = true) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  return useQuery({
    queryKey: playKeys.rewards,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new PlayApiError("Unauthorized", 401);
      return fetchRewards(token);
    },
    enabled: enabled && ready && authenticated,
    retry: (failureCount, error) =>
      !(error instanceof PlayApiError && error.status < 500) &&
      failureCount < 2,
    staleTime: 30_000,
  });
}

/** Existing referral system's data (code for the share link). */
export function useReferralData(enabled = true) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  return useQuery({
    queryKey: playKeys.referralData,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error("Unauthorized");
      const res = await getReferralData(token);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled: enabled && ready && authenticated,
    staleTime: 5 * 60_000,
  });
}

export function useJoinLeague() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { username: string; acceptTerms: true }) => {
      const token = await getAccessToken();
      if (!token) throw new PlayApiError("Unauthorized", 401);
      return joinLeague(body, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playKeys.squad });
      queryClient.invalidateQueries({ queryKey: ["play", "leaderboard"] });
    },
  });
}

export function useSaveSquad() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SaveSquadBody) => {
      const token = await getAccessToken();
      if (!token) throw new PlayApiError("Unauthorized", 401);
      return saveSquad(body, token);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: playKeys.squad }),
  });
}

export function useMakeTransfers() {
  const { getAccessToken } = usePrivy();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: TransfersBody) => {
      const token = await getAccessToken();
      if (!token) throw new PlayApiError("Unauthorized", 401);
      return makeTransfers(body, token);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: playKeys.squad }),
  });
}

/**
 * Debounced username availability check against GET /api/play/username/check.
 */
export function useUsernameAvailability(candidate: string, debounceMs = 400) {
  const { authenticated, getAccessToken } = usePrivy();
  const [result, setResult] = useState<UsernameCheckResponse | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setResult(null);
    const trimmed = candidate.trim();
    if (!authenticated || trimmed.length < 3) {
      setChecking(false);
      return;
    }
    setChecking(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Unauthorized");
        const res = await checkUsername(trimmed, token);
        if (!cancelled) setResult(res);
      } catch {
        if (!cancelled) setResult(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidate, debounceMs, authenticated, getAccessToken]);

  return { result, checking };
}

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  expired: boolean;
}

const partsFor = (target: number | null): CountdownParts => {
  const totalMs = target == null ? 0 : Math.max(0, target - Date.now());
  return {
    days: Math.floor(totalMs / 86_400_000),
    hours: Math.floor((totalMs % 86_400_000) / 3_600_000),
    minutes: Math.floor((totalMs % 3_600_000) / 60_000),
    seconds: Math.floor((totalMs % 60_000) / 1000),
    totalMs,
    expired: target != null && totalMs <= 0,
  };
};

/** Ticking countdown to an ISO timestamp (1s resolution). */
export function useCountdown(targetIso: string | null | undefined) {
  const target = useMemo(
    () => (targetIso ? new Date(targetIso).getTime() : null),
    [targetIso],
  );
  const [parts, setParts] = useState<CountdownParts>(() => partsFor(target));

  useEffect(() => {
    setParts(partsFor(target));
    if (target == null) return;
    const id = setInterval(() => setParts(partsFor(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  return parts;
}

/** Copy helper with sonner-friendly result. */
export function useCopyToClipboard() {
  return useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, []);
}
