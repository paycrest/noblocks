import "server-only";
import { supabaseAdmin } from "../supabase";
import { fetchAll } from "./pagination";
import type { FantasyPlayer } from "./types";

/** Player pool changes at most daily (price / is_active from worker or seed). */
const PLAYERS_CACHE_TTL_MS = 5 * 60_000;

let cached: { map: Map<number, FantasyPlayer>; expiresAt: number } | null = null;

export function invalidatePlayersCache(): void {
  cached = null;
}

/** Full player pool keyed by provider_player_id. Cached map is read-only — do not mutate. */
export async function getPlayersMap(): Promise<Map<number, FantasyPlayer>> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.map;

  const rows = await fetchAll<FantasyPlayer>((from, to) =>
    supabaseAdmin
      .from("fantasy_players")
      .select(
        "provider_player_id, team_id, name, nation, position, price, photo_url, is_active",
      )
      .range(from, to),
  );

  const map = new Map<number, FantasyPlayer>();
  for (const p of rows) {
    map.set(Number(p.provider_player_id), p);
  }
  cached = { map, expiresAt: now + PLAYERS_CACHE_TTL_MS };
  return map;
}
