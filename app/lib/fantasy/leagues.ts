import "server-only";
import { randomInt } from "crypto";
import { supabaseAdmin } from "../supabase";
import { fetchAll, fetchAllIn, IN_CHUNK } from "./pagination";
import { getFantasySettings } from "./settings";

export interface LeagueStandingRow {
  wallet_address: string;
  username: string | null;
  points: number;
  transfers: number;
  rank: number;
  joined_gameweek: number;
  is_me: boolean;
}

export interface LeagueSummary {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  member_count: number;
  standings: LeagueStandingRow[];
}

function randomInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[randomInt(alphabet.length)];
  }
  return code;
}

export interface LeagueMemberInput {
  wallet_address: string;
  joined_at: string;
  joined_gameweek: number;
}

/**
 * Pure join-week ranking (unit-tested in __tests__/fantasy-leagues.test.ts).
 * Points and transfers only count from each member's joined_gameweek onward;
 * ties break by fewer transfers, then earlier join time.
 */
export function rankLeagueStandings(input: {
  members: LeagueMemberInput[];
  scores: { wallet_address: string; matchday_id: number; points: number }[];
  transfers: { wallet_address: string; matchday_id: number }[];
  usernameByWallet: Map<string, string | null>;
  viewerWallet: string;
}): LeagueStandingRow[] {
  const rows = input.members.map((m) => {
    const wallet = m.wallet_address;
    const fromGw = m.joined_gameweek;
    const points = input.scores
      .filter((s) => s.wallet_address === wallet && s.matchday_id >= fromGw)
      .reduce((sum, s) => sum + s.points, 0);
    const transferCount = input.transfers.filter(
      (t) => t.wallet_address === wallet && t.matchday_id >= fromGw,
    ).length;
    return {
      wallet_address: wallet,
      username: input.usernameByWallet.get(wallet) ?? null,
      points,
      transfers: transferCount,
      joined_gameweek: fromGw,
      joined_at: m.joined_at,
      is_me: wallet === input.viewerWallet,
    };
  });

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (a.transfers !== b.transfers) return a.transfers - b.transfers;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });

  return rows.map((r, i) => ({
    wallet_address: r.wallet_address,
    username: r.username,
    points: r.points,
    transfers: r.transfers,
    rank: i + 1,
    joined_gameweek: r.joined_gameweek,
    is_me: r.is_me,
  }));
}

type ScoreRow = { wallet_address: string; matchday_id: number; points: number };
type TransferRow = { wallet_address: string; matchday_id: number };

async function loadLeagueStandingsData(leagueId: string): Promise<{
  members: LeagueMemberInput[];
  scores: ScoreRow[];
  transfers: TransferRow[];
  usernameByWallet: Map<string, string | null>;
}> {
  const settings = await getFantasySettings();
  const members = await fetchAll<{
    wallet_address: string;
    joined_at: string;
    joined_gameweek: number;
  }>((from, to) =>
    supabaseAdmin
      .from("fantasy_league_members")
      .select("wallet_address, joined_at, joined_gameweek")
      .eq("league_id", leagueId)
      .range(from, to),
  );
  if (members.length === 0) {
    return {
      members: [],
      scores: [],
      transfers: [],
      usernameByWallet: new Map(),
    };
  }

  const wallets = members.map((m) => m.wallet_address);
  const minGw = Math.min(...members.map((m) => Number(m.joined_gameweek)));
  const mdMin = Math.max(minGw, settings.season_matchday_min);
  const mdMax = settings.season_matchday_max;

  const [scores, transfers, profiles] = await Promise.all([
    fetchAllIn<ScoreRow>(wallets, IN_CHUNK, (chunk) =>
      supabaseAdmin
        .from("fantasy_matchday_scores")
        .select("wallet_address, matchday_id, points")
        .in("wallet_address", chunk)
        .gte("matchday_id", mdMin)
        .lte("matchday_id", mdMax),
    ),
    fetchAllIn<TransferRow>(wallets, IN_CHUNK, (chunk) =>
      supabaseAdmin
        .from("fantasy_transfers")
        .select("wallet_address, matchday_id")
        .in("wallet_address", chunk)
        .gte("matchday_id", mdMin)
        .lte("matchday_id", mdMax),
    ),
    fetchAllIn<{ wallet_address: string; username: string | null }>(wallets, IN_CHUNK, (chunk) =>
      supabaseAdmin
        .from("user_kyc_profiles")
        .select("wallet_address, username")
        .in("wallet_address", chunk),
    ),
  ]);

  return {
    members: members.map((m) => ({
      wallet_address: m.wallet_address,
      joined_at: m.joined_at,
      joined_gameweek: Number(m.joined_gameweek),
    })),
    scores: scores.map((s) => ({
      wallet_address: s.wallet_address,
      matchday_id: Number(s.matchday_id),
      points: Number(s.points),
    })),
    transfers: transfers.map((t) => ({
      wallet_address: t.wallet_address,
      matchday_id: Number(t.matchday_id),
    })),
    usernameByWallet: new Map(
      profiles.map((p) => [p.wallet_address, p.username ?? null]),
    ),
  };
}

/** Join-week standings: sum scores from joined_gameweek onward; tie-break fewer transfers, then join time. */
export async function computeLeagueStandings(
  leagueId: string,
  viewerWallet: string,
): Promise<LeagueStandingRow[]> {
  const data = await loadLeagueStandingsData(leagueId);
  if (data.members.length === 0) return [];
  return rankLeagueStandings({
    ...data,
    viewerWallet,
  });
}

export async function listLeaguesForWallet(wallet: string): Promise<LeagueSummary[]> {
  const { data: memberships, error } = await supabaseAdmin
    .from("fantasy_league_members")
    .select("league_id, fantasy_leagues(id, name, invite_code, created_by)")
    .eq("wallet_address", wallet);
  if (error) throw error;

  const leagueMeta: {
    id: string;
    name: string;
    invite_code: string;
    created_by: string;
  }[] = [];
  for (const row of memberships ?? []) {
    const league = row.fantasy_leagues as unknown as {
      id: string;
      name: string;
      invite_code: string;
      created_by: string;
    } | null;
    if (league) leagueMeta.push(league);
  }
  if (leagueMeta.length === 0) return [];

  const settings = await getFantasySettings();
  const leagueIds = leagueMeta.map((l) => l.id);

  const allMembers = await fetchAllIn<{
    league_id: string;
    wallet_address: string;
    joined_at: string;
    joined_gameweek: number;
  }>(leagueIds, IN_CHUNK, (chunk) =>
    supabaseAdmin
      .from("fantasy_league_members")
      .select("league_id, wallet_address, joined_at, joined_gameweek")
      .in("league_id", chunk),
  );

  const membersByLeague = new Map<string, LeagueMemberInput[]>();
  for (const m of allMembers) {
    const list = membersByLeague.get(m.league_id) ?? [];
    list.push({
      wallet_address: m.wallet_address,
      joined_at: m.joined_at,
      joined_gameweek: Number(m.joined_gameweek),
    });
    membersByLeague.set(m.league_id, list);
  }

  const allWallets = [...new Set(allMembers.map((m) => m.wallet_address))];
  const minGw =
    allMembers.length > 0
      ? Math.min(...allMembers.map((m) => Number(m.joined_gameweek)))
      : settings.season_matchday_min;
  const mdMin = Math.max(minGw, settings.season_matchday_min);
  const mdMax = settings.season_matchday_max;

  const [scores, transfers, profiles] = await Promise.all([
    fetchAllIn<ScoreRow>(allWallets, IN_CHUNK, (chunk) =>
      supabaseAdmin
        .from("fantasy_matchday_scores")
        .select("wallet_address, matchday_id, points")
        .in("wallet_address", chunk)
        .gte("matchday_id", mdMin)
        .lte("matchday_id", mdMax),
    ),
    fetchAllIn<TransferRow>(allWallets, IN_CHUNK, (chunk) =>
      supabaseAdmin
        .from("fantasy_transfers")
        .select("wallet_address, matchday_id")
        .in("wallet_address", chunk)
        .gte("matchday_id", mdMin)
        .lte("matchday_id", mdMax),
    ),
    fetchAllIn<{ wallet_address: string; username: string | null }>(allWallets, IN_CHUNK, (chunk) =>
      supabaseAdmin
        .from("user_kyc_profiles")
        .select("wallet_address, username")
        .in("wallet_address", chunk),
    ),
  ]);

  const usernameByWallet = new Map(
    profiles.map((p) => [p.wallet_address, p.username ?? null]),
  );
  const scoreRows = scores.map((s) => ({
    wallet_address: s.wallet_address,
    matchday_id: Number(s.matchday_id),
    points: Number(s.points),
  }));
  const transferRows = transfers.map((t) => ({
    wallet_address: t.wallet_address,
    matchday_id: Number(t.matchday_id),
  }));

  return leagueMeta.map((league) => {
    const members = membersByLeague.get(league.id) ?? [];
    const standings = rankLeagueStandings({
      members,
      scores: scoreRows,
      transfers: transferRows,
      usernameByWallet,
      viewerWallet: wallet,
    });
    return {
      id: league.id,
      name: league.name,
      invite_code: league.invite_code,
      created_by: league.created_by,
      member_count: standings.length,
      standings: standings.slice(0, 25),
    };
  });
}

/** Soft-cap matching FPL private-league limit. */
export const MAX_LEAGUES_PER_WALLET = 30;

async function assertUnderLeagueCap(wallet: string): Promise<void> {
  const { count, error } = await supabaseAdmin
    .from("fantasy_league_members")
    .select("league_id", { count: "exact", head: true })
    .eq("wallet_address", wallet);
  if (error) throw error;
  if ((count ?? 0) >= MAX_LEAGUES_PER_WALLET) throw new Error("LEAGUE_CAP");
}

export async function createLeague(input: {
  name: string;
  wallet: string;
  joinedGameweek: number;
}): Promise<LeagueSummary> {
  const name = input.name.trim().slice(0, 40);
  if (name.length < 3) throw new Error("NAME_TOO_SHORT");
  await assertUnderLeagueCap(input.wallet);

  let invite = randomInviteCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("fantasy_leagues")
      .insert({
        name,
        invite_code: invite,
        created_by: input.wallet,
      })
      .select("id, name, invite_code, created_by")
      .single();
    if (!error && data) {
      const { error: memErr } = await supabaseAdmin.from("fantasy_league_members").insert({
        league_id: data.id,
        wallet_address: input.wallet,
        joined_gameweek: input.joinedGameweek,
      });
      if (memErr) {
        await supabaseAdmin.from("fantasy_leagues").delete().eq("id", data.id);
        throw memErr;
      }
      return {
        id: data.id as string,
        name: data.name as string,
        invite_code: data.invite_code as string,
        created_by: data.created_by as string,
        member_count: 1,
        standings: await computeLeagueStandings(data.id as string, input.wallet),
      };
    }
    if (error?.code !== "23505") throw error;
    invite = randomInviteCode();
  }
  throw new Error("INVITE_COLLISION");
}

export async function joinLeagueByCode(input: {
  code: string;
  wallet: string;
  joinedGameweek: number;
}): Promise<LeagueSummary> {
  const code = input.code.trim().toUpperCase();
  const { data: league, error } = await supabaseAdmin
    .from("fantasy_leagues")
    .select("id, name, invite_code, created_by")
    .eq("invite_code", code)
    .maybeSingle();
  if (error) throw error;
  if (!league) throw new Error("NOT_FOUND");
  await assertUnderLeagueCap(input.wallet);

  const { error: memErr } = await supabaseAdmin.from("fantasy_league_members").insert({
    league_id: league.id,
    wallet_address: input.wallet,
    joined_gameweek: input.joinedGameweek,
  });
  if (memErr) {
    if (memErr.code === "23505") throw new Error("ALREADY_MEMBER");
    throw memErr;
  }

  const standings = await computeLeagueStandings(league.id as string, input.wallet);
  return {
    id: league.id as string,
    name: league.name as string,
    invite_code: league.invite_code as string,
    created_by: league.created_by as string,
    member_count: standings.length,
    standings: standings.slice(0, 25),
  };
}

export async function leaveLeague(leagueId: string, wallet: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("fantasy_league_members")
    .delete()
    .eq("league_id", leagueId)
    .eq("wallet_address", wallet);
  if (error) throw error;

  const { count } = await supabaseAdmin
    .from("fantasy_league_members")
    .select("wallet_address", { count: "exact", head: true })
    .eq("league_id", leagueId);

  if ((count ?? 0) === 0) {
    await supabaseAdmin.from("fantasy_leagues").delete().eq("id", leagueId);
  }
}
