/**
 * Noblocks Play — thin typed fetch layer over /api/play/*.
 * Every route answers with the { success, data } / { success: false, error }
 * envelope; failures are thrown as PlayApiError so react-query can surface
 * the server's message, error code and any validation detail.
 */

import type {
  JoinResponse,
  LeaderboardResponse,
  MatchdayResponse,
  PlayersResponse,
  RewardsResponse,
  SaveSquadBody,
  SquadResponse,
  TransfersBody,
  TransfersResponse,
  UsernameCheckResponse,
} from "./types";

export class PlayApiError extends Error {
  status: number;
  code?: string;
  /** Squad validation errors (400s from PUT /squad and POST /transfers). */
  errors?: string[];
  /** Username alternatives (409 from POST /join, taken usernames on check). */
  suggestions?: string[];

  constructor(
    message: string,
    status: number,
    extra?: { code?: string; errors?: string[]; suggestions?: string[] },
  ) {
    super(message);
    this.name = "PlayApiError";
    this.status = status;
    this.code = extra?.code;
    this.errors = extra?.errors;
    this.suggestions = extra?.suggestions;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  token?: string | null;
}

async function playRequest<T>(
  path: string,
  { method = "GET", body, token }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  let payload: {
    success?: boolean;
    data?: T;
    error?: string;
    code?: string;
    errors?: string[];
    suggestions?: string[];
  } | null = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON response (proxy error page etc.) — fall through to the throw.
  }

  if (!response.ok || !payload?.success) {
    throw new PlayApiError(
      payload?.error ?? `Request failed (${response.status})`,
      response.status,
      {
        code: payload?.code,
        errors: payload?.errors,
        suggestions: payload?.suggestions,
      },
    );
  }

  return payload.data as T;
}

/* ------------------------------- Public ------------------------------- */

export const fetchPlayers = () =>
  playRequest<PlayersResponse>("/api/play/players");

export const fetchMatchday = (id: number | string) =>
  playRequest<MatchdayResponse>(`/api/play/matchday/${id}`);

export const fetchLeaderboard = (params: {
  page: number;
  findMe?: boolean;
  token?: string | null;
}) => {
  const search = new URLSearchParams({ page: String(params.page) });
  if (params.findMe) search.set("find", "me");
  return playRequest<LeaderboardResponse>(
    `/api/play/leaderboard?${search.toString()}`,
    { token: params.token },
  );
};

/* ----------------------------- Authenticated ---------------------------- */

export const checkUsername = (candidate: string, token: string) =>
  playRequest<UsernameCheckResponse>(
    `/api/play/username/check?u=${encodeURIComponent(candidate)}`,
    { token },
  );

export const joinLeague = (
  body: { username: string; acceptTerms: true; giveawayOptIn: boolean },
  token: string,
) => playRequest<JoinResponse>("/api/play/join", { method: "POST", body, token });

export const fetchSquad = (token: string) =>
  playRequest<SquadResponse>("/api/play/squad", { token });

export const saveSquad = (body: SaveSquadBody, token: string) =>
  playRequest<{ squad: SquadResponse["squad"] }>("/api/play/squad", {
    method: "PUT",
    body,
    token,
  });

export const makeTransfers = (body: TransfersBody, token: string) =>
  playRequest<TransfersResponse>("/api/play/transfers", {
    method: "POST",
    body,
    token,
  });

export const fetchRewards = (token: string) =>
  playRequest<RewardsResponse>("/api/play/rewards", { token });

export const setGiveawayOptIn = (optIn: boolean, token: string) =>
  playRequest<{ giveaway_opt_in: boolean }>("/api/play/opt-in", {
    method: "POST",
    body: { optIn },
    token,
  });
