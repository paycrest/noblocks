import "server-only";
import { supabaseAdmin } from "../supabase";
import { resolveIdentityScopes, identityDedupeKey } from "../kyc-identity";
import { trackBusinessEvent } from "../server-analytics";
import { fetchAll, fetchAllIn, IN_CHUNK } from "./pagination";
import { getFantasySettings } from "./settings";

export interface ChallengeRow {
  id: string;
  gameweek_id: number;
  title: string;
  prize_usdc: number;
  min_league_size: number;
  status: "scheduled" | "open" | "locked" | "resolved";
  winner_wallet: string | null;
  resolved_at: string | null;
  meta: Record<string, unknown>;
}

export interface ChallengeCandidate {
  wallet_address: string;
  username: string | null;
  points: number;
  league_id: string;
  eligible: boolean;
  skip_reason?: string;
}

/** Two clear GWs before the challenge GW: joined_gameweek ≤ challengeGw − 2. */
export function hasTwoClearGameweeks(joinedGameweek: number, challengeGw: number): boolean {
  return joinedGameweek <= challengeGw - 2;
}

/** Lost CAS retries before giving up (concurrent worker ticks). */
const MAX_RESOLVE_CAS_DEPTH = 5;

type MembershipRow = {
  league_id: string;
  wallet_address: string;
  joined_gameweek: number;
};

/**
 * Resolve a challenge: highest GW points among eligible managers.
 * Eligibility: active squad for GW; in a league with ≥min active squads;
 * two clear GWs since league join; one team per identity (resolveIdentityScopes).
 */
export async function resolveChallenge(
  challengeId: string,
  casDepth = 0,
): Promise<{
  challenge: ChallengeRow;
  winner: ChallengeCandidate | null;
  candidates: ChallengeCandidate[];
}> {
  const { data: challenge, error } = await supabaseAdmin
    .from("fantasy_challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();
  if (error) throw error;
  if (!challenge) throw new Error("NOT_FOUND");
  if (challenge.status === "resolved") {
    return {
      challenge: challenge as ChallengeRow,
      winner: challenge.winner_wallet
        ? {
            wallet_address: challenge.winner_wallet as string,
            username: null,
            points: Number((challenge.meta as { winner_points?: number })?.winner_points ?? 0),
            league_id: String((challenge.meta as { winner_league_id?: string })?.winner_league_id ?? ""),
            eligible: true,
          }
        : null,
      candidates: ((challenge.meta as { candidates?: ChallengeCandidate[] })?.candidates ??
        []) as ChallengeCandidate[],
    };
  }

  const gw = Number(challenge.gameweek_id);
  const minSize = Number(challenge.min_league_size) || 5;
  const settings = await getFantasySettings();
  if (gw < settings.season_matchday_min || gw > settings.season_matchday_max) {
    throw new Error("OUT_OF_SEASON");
  }

  const { data: md } = await supabaseAdmin
    .from("fantasy_matchdays")
    .select("id, status")
    .eq("id", gw)
    .maybeSingle();
  if (!md || md.status !== "final") throw new Error("GW_NOT_FINAL");

  const scores = await fetchAll<{ wallet_address: string; points: number }>((from, to) =>
    supabaseAdmin
      .from("fantasy_matchday_scores")
      .select("wallet_address, points")
      .eq("matchday_id", gw)
      .range(from, to),
  );

  const squads = await fetchAll<{ wallet_address: string }>((from, to) =>
    supabaseAdmin
      .from("fantasy_squads")
      .select("wallet_address")
      .eq("matchday_id", gw)
      .range(from, to),
  );
  const activeSquads = new Set(squads.map((s) => s.wallet_address));

  // Memberships for managers with an active squad — enough to find qualifying leagues.
  const activeMemberships = activeSquads.size
    ? await fetchAllIn<MembershipRow>(
        [...activeSquads],
        IN_CHUNK,
        (chunk) =>
          supabaseAdmin
            .from("fantasy_league_members")
            .select("league_id, wallet_address, joined_gameweek")
            .in("wallet_address", chunk),
      )
    : [];

  const activeByLeague = new Map<string, MembershipRow[]>();
  for (const m of activeMemberships) {
    const list = activeByLeague.get(m.league_id) ?? [];
    list.push(m);
    activeByLeague.set(m.league_id, list);
  }

  const qualifyingLeagues = new Set<string>();
  for (const [leagueId, members] of activeByLeague) {
    if (members.length >= minSize) qualifyingLeagues.add(leagueId);
  }

  // Full membership for qualifying leagues only (includes non-squad holders).
  const memberships = qualifyingLeagues.size
    ? await fetchAllIn<MembershipRow>(
        [...qualifyingLeagues],
        IN_CHUNK,
        (chunk) =>
          supabaseAdmin
            .from("fantasy_league_members")
            .select("league_id, wallet_address, joined_gameweek")
            .in("league_id", chunk),
      )
    : [];

  const byLeague = new Map<string, { wallet: string; joined: number }[]>();
  for (const m of memberships) {
    const list = byLeague.get(m.league_id) ?? [];
    list.push({ wallet: m.wallet_address, joined: m.joined_gameweek });
    byLeague.set(m.league_id, list);
  }

  const scoreByWallet = new Map(
    scores.map((s) => [s.wallet_address, Number(s.points)]),
  );

  const wallets = new Set<string>();
  for (const leagueId of qualifyingLeagues) {
    for (const m of byLeague.get(leagueId) ?? []) wallets.add(m.wallet);
  }

  const profiles = wallets.size
    ? await fetchAllIn<{ wallet_address: string; username: string | null }>(
        [...wallets],
        IN_CHUNK,
        (chunk) =>
          supabaseAdmin
            .from("user_kyc_profiles")
            .select("wallet_address, username")
            .in("wallet_address", chunk),
      )
    : [];
  const usernameByWallet = new Map(
    profiles.map((p) => [p.wallet_address, p.username ?? null]),
  );

  const raw: ChallengeCandidate[] = [];
  for (const wallet of wallets) {
    const walletMemberships = memberships.filter(
      (m) => m.wallet_address === wallet && qualifyingLeagues.has(m.league_id),
    );
    const membership = walletMemberships.reduce<MembershipRow | undefined>(
      (best, m) => (!best || m.joined_gameweek < best.joined_gameweek ? m : best),
      undefined,
    );
    const leagueId = membership?.league_id ?? "";
    const joined = Number(membership?.joined_gameweek ?? gw);

    if (!activeSquads.has(wallet)) {
      raw.push({
        wallet_address: wallet,
        username: usernameByWallet.get(wallet) ?? null,
        points: scoreByWallet.get(wallet) ?? 0,
        league_id: leagueId,
        eligible: false,
        skip_reason: "no_active_squad",
      });
      continue;
    }
    if (!hasTwoClearGameweeks(joined, gw)) {
      raw.push({
        wallet_address: wallet,
        username: usernameByWallet.get(wallet) ?? null,
        points: scoreByWallet.get(wallet) ?? 0,
        league_id: leagueId,
        eligible: false,
        skip_reason: "two_clear_gameweeks",
      });
      continue;
    }
    raw.push({
      wallet_address: wallet,
      username: usernameByWallet.get(wallet) ?? null,
      points: scoreByWallet.get(wallet) ?? 0,
      league_id: leagueId,
      eligible: true,
    });
  }

  // One team per person: highest score keeps eligibility within an identity scope.
  const ordered = [...raw].sort(
    (a, b) => b.points - a.points || a.wallet_address.localeCompare(b.wallet_address),
  );
  const seenIdentity = new Set<string>();
  const finalCandidates: ChallengeCandidate[] = [];
  const eligibleWallets = ordered.filter((c) => c.eligible).map((c) => c.wallet_address);
  let identityByWallet: Map<string, string>;
  try {
    const scopes = await resolveIdentityScopes(eligibleWallets);
    identityByWallet = new Map(
      [...scopes.entries()].map(([wallet, scope]) => [wallet, identityDedupeKey(scope)]),
    );
  } catch (e) {
    throw new Error(`IDENTITY_RESOLUTION_FAILED: ${String(e)}`);
  }

  for (const c of ordered) {
    if (!c.eligible) {
      finalCandidates.push(c);
      continue;
    }
    const key =
      identityByWallet.get(c.wallet_address.trim().toLowerCase()) ??
      `wallet:${c.wallet_address.trim().toLowerCase()}`;
    if (seenIdentity.has(key)) {
      finalCandidates.push({ ...c, eligible: false, skip_reason: "identity_sibling" });
      continue;
    }
    seenIdentity.add(key);
    finalCandidates.push(c);
  }

  const ranked = finalCandidates
    .filter((c) => c.eligible)
    .sort((a, b) => b.points - a.points || a.wallet_address.localeCompare(b.wallet_address));
  const winner = ranked[0] ?? null;

  const meta = {
    ...(typeof challenge.meta === "object" && challenge.meta ? challenge.meta : {}),
    candidates: finalCandidates.slice(0, 100),
    winner_points: winner?.points ?? null,
    winner_league_id: winner?.league_id ?? null,
    resolved_by: "worker_or_admin",
  };

  // Optimistic lock: only the tick that still sees the status it read may
  // resolve. Overlapping worker ticks (runs every minute) would otherwise
  // both compute, both write, and both fire the resolved event — last write
  // wins with a possibly different winner.
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("fantasy_challenges")
    .update({
      status: "resolved",
      winner_wallet: winner?.wallet_address ?? null,
      resolved_at: new Date().toISOString(),
      meta,
    })
    .eq("id", challengeId)
    .eq("status", challenge.status)
    .select("*")
    .maybeSingle();
  if (updErr) throw updErr;
  if (!updated) {
    if (casDepth >= MAX_RESOLVE_CAS_DEPTH) {
      throw new Error("RESOLVE_CAS_CONTENTION");
    }
    return resolveChallenge(challengeId, casDepth + 1);
  }

  trackBusinessEvent("Fantasy Challenge Resolved", {
    challenge_id: challengeId,
    gameweek_id: gw,
    winner_wallet: winner?.wallet_address ?? null,
    winner_points: winner?.points ?? null,
    prize_usdc: Number(challenge.prize_usdc),
  });

  return {
    challenge: updated as ChallengeRow,
    winner,
    candidates: finalCandidates,
  };
}

/** Resolve any open/locked challenges for a finalized gameweek. */
export async function resolveChallengesForGameweek(
  gameweekId: number,
  alerts: string[],
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("fantasy_challenges")
    .select("id, status")
    .eq("gameweek_id", gameweekId)
    .in("status", ["open", "locked", "scheduled"]);
  if (error) {
    alerts.push(`challenge lookup failed for GW ${gameweekId}: ${error.message}`);
    return 0;
  }
  let n = 0;
  for (const row of data ?? []) {
    try {
      await resolveChallenge(row.id as string);
      n++;
    } catch (e) {
      alerts.push(`challenge ${row.id} resolve failed: ${String(e)}`);
    }
  }
  return n;
}

export async function listChallenges(limit = 20): Promise<ChallengeRow[]> {
  const settings = await getFantasySettings();
  const { data, error } = await supabaseAdmin
    .from("fantasy_challenges")
    .select("*")
    .gte("gameweek_id", settings.season_matchday_min)
    .lte("gameweek_id", settings.season_matchday_max)
    .order("gameweek_id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ChallengeRow[];
}

/** Ops guardrail — max USDC across GW challenges in a rolling 30-day window. */
export const MAX_MONTHLY_CHALLENGE_PRIZE_USDC = 100;

export const MIN_CHALLENGE_LEAGUE_SIZE = 2;
export const MAX_CHALLENGE_LEAGUE_SIZE = 100;
export const DEFAULT_CHALLENGE_LEAGUE_SIZE = 5;

const TRAILING_BUDGET_DAYS = 30;

export function validateChallengeCreate(input: {
  gameweekId: number;
  prizeUsdc: number;
  minLeagueSize?: number;
  seasonMatchdayMin: number;
  seasonMatchdayMax: number;
}): void {
  const { gameweekId, prizeUsdc, minLeagueSize, seasonMatchdayMin, seasonMatchdayMax } =
    input;
  if (
    !Number.isFinite(gameweekId) ||
    !Number.isInteger(gameweekId) ||
    gameweekId < seasonMatchdayMin ||
    gameweekId > seasonMatchdayMax
  ) {
    throw new Error("OUT_OF_SEASON");
  }
  if (!Number.isFinite(prizeUsdc) || prizeUsdc < 0) {
    throw new Error("INVALID_PRIZE");
  }
  const size = minLeagueSize ?? DEFAULT_CHALLENGE_LEAGUE_SIZE;
  if (
    !Number.isFinite(size) ||
    !Number.isInteger(size) ||
    size < MIN_CHALLENGE_LEAGUE_SIZE ||
    size > MAX_CHALLENGE_LEAGUE_SIZE
  ) {
    throw new Error("INVALID_MIN_LEAGUE_SIZE");
  }
}

export async function createChallenge(input: {
  gameweekId: number;
  title: string;
  prizeUsdc: number;
  minLeagueSize?: number;
}): Promise<ChallengeRow> {
  const title = input.title.trim().slice(0, 80);
  if (title.length < 3) throw new Error("TITLE_TOO_SHORT");
  const settings = await getFantasySettings();
  const minLeagueSize = input.minLeagueSize ?? DEFAULT_CHALLENGE_LEAGUE_SIZE;
  validateChallengeCreate({
    gameweekId: input.gameweekId,
    prizeUsdc: input.prizeUsdc,
    minLeagueSize,
    seasonMatchdayMin: settings.season_matchday_min,
    seasonMatchdayMax: settings.season_matchday_max,
  });
  // The rolling-budget ceiling is enforced inside fantasy_create_challenge,
  // under an advisory lock — the only place it can be race-free. Checking it
  // here too would just be a second, weaker source of truth.
  const { data, error } = await supabaseAdmin.rpc("fantasy_create_challenge", {
    p_gameweek_id: input.gameweekId,
    p_title: title,
    p_prize_usdc: input.prizeUsdc,
    p_min_league_size: minLeagueSize,
    p_max_budget: MAX_MONTHLY_CHALLENGE_PRIZE_USDC,
    p_trailing_days: TRAILING_BUDGET_DAYS,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("PRIZE_TOO_HIGH")) throw new Error("PRIZE_TOO_HIGH");
    if (msg.includes("PRIZE_BUDGET_EXCEEDED")) throw new Error("PRIZE_BUDGET_EXCEEDED");
    if (msg.includes("DUPLICATE_GAMEWEEK")) throw new Error("DUPLICATE_GAMEWEEK");
    throw error;
  }
  return data as ChallengeRow;
}
