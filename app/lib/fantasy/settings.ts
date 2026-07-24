import "server-only";
import { supabaseAdmin } from "../supabase";
import type { FantasySettings } from "./types";

/**
 * fantasy_settings singleton loader with a short in-process cache — rule
 * tweaks land within a minute without a deploy (TRD §4), while route handlers
 * and the worker avoid re-reading the row on every request.
 */

const CACHE_TTL_MS = 60_000;

let cached: { settings: FantasySettings; expiresAt: number } | null = null;

export async function getFantasySettings(): Promise<FantasySettings> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.settings;

  const { data, error } = await supabaseAdmin
    .from("fantasy_settings")
    .select("config")
    .eq("id", 1)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load fantasy_settings: ${error?.message ?? "no row"}`);
  }

  const settings = data.config as FantasySettings;
  cached = { settings, expiresAt: now + CACHE_TTL_MS };
  return settings;
}

export function invalidateFantasySettingsCache() {
  cached = null;
}

export function qualificationDeadline(settings: FantasySettings): Date {
  return new Date(settings.qualification_deadline);
}

/** Matchday id (6/7/8) → settings key (MD6/MD7/MD8). */
export function matchdayLabel(matchdayId: number): string {
  return `MD${matchdayId}`;
}
