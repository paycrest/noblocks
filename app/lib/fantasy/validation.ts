import type { FantasyPlayer, FantasySettings, SquadSelection } from "./types";

/** 3–20 chars, alphanumeric + underscore, no leading/trailing underscore. */
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9]$/;

/**
 * Reserved words + profanity blocklist (matched case-insensitively as a
 * substring for slurs, exact for reserved handles). Deliberately small and
 * high-precision — support can rename abusive users manually (PRD §5.3).
 */
const RESERVED = new Set([
  "admin", "administrator", "noblocks", "paycrest", "support", "official",
  "moderator", "mod", "staff", "team", "help", "system", "root", "api",
  "null", "undefined", "anonymous", "winner", "fifa", "worldcup",
]);

const BLOCKED_SUBSTRINGS = [
  "nigger", "nigga", "faggot", "retard", "hitler", "nazi", "rape",
  "cunt", "whore", "slut", "porn", "pedo",
];

export type UsernameValidation =
  | { ok: true; normalized: string }
  | { ok: false; error: string };

export function validateUsername(raw: string): UsernameValidation {
  const username = raw.trim();
  if (username.length < 3 || username.length > 20) {
    return { ok: false, error: "Username must be 3–20 characters" };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      error:
        "Only letters, numbers and underscores — and it can't start or end with an underscore",
    };
  }
  const lower = username.toLowerCase();
  if (RESERVED.has(lower)) {
    return { ok: false, error: "That username is reserved" };
  }
  if (BLOCKED_SUBSTRINGS.some((w) => lower.includes(w))) {
    return { ok: false, error: "That username isn't allowed" };
  }
  return { ok: true, normalized: username };
}

/** Suggest available-looking alternatives on collision. */
export function suggestUsernames(base: string): string[] {
  const stem = base.replace(/[^A-Za-z0-9_]/g, "").slice(0, 15) || "player";
  const year = "26";
  const rand = () => Math.floor(Math.random() * 900 + 100);
  return [`${stem}${year}`, `${stem}_${rand()}`, `${stem}${rand()}`];
}

export interface SquadValidationInput {
  selection: SquadSelection;
  players: Map<number, FantasyPlayer>;
  settings: FantasySettings;
  matchdayLabel: string; // MD6 | MD7 | MD8 — sets the per-nation cap
}

export type SquadValidationResult = { ok: true } | { ok: false; errors: string[] };

/**
 * Full squad validation per TRD §6.1: 15 players (2 GK / 5 DEF / 5 MID / 3 FWD),
 * budget, per-nation cap for the current stage, valid XI formation, captain and
 * vice both in the starting XI and distinct.
 */
export function validateSquad(input: SquadValidationInput): SquadValidationResult {
  const { selection, players, settings, matchdayLabel } = input;
  const errors: string[] = [];

  const slots = new Set<number>();
  const ids = new Set<number>();
  for (const { playerId, slot } of selection.players) {
    if (slot < 1 || slot > settings.squad_size) errors.push(`Invalid slot ${slot}`);
    if (slots.has(slot)) errors.push(`Duplicate slot ${slot}`);
    if (ids.has(playerId)) errors.push("Duplicate player in squad");
    slots.add(slot);
    ids.add(playerId);
  }

  if (selection.players.length !== settings.squad_size) {
    errors.push(`Squad must have exactly ${settings.squad_size} players`);
    return { ok: false, errors };
  }

  const resolved = selection.players.map(({ playerId, slot }) => {
    const player = players.get(playerId);
    return { player, playerId, slot };
  });

  const missing = resolved.filter((r) => !r.player);
  if (missing.length > 0) {
    errors.push("Squad contains unknown players");
    return { ok: false, errors };
  }

  const all = resolved as { player: FantasyPlayer; playerId: number; slot: number }[];

  // Position quotas over the full 15
  const positionCounts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const { player } of all) positionCounts[player.position]++;
  for (const [pos, required] of Object.entries(settings.positions)) {
    if (positionCounts[pos] !== required) {
      errors.push(`Squad needs exactly ${required} ${pos}, has ${positionCounts[pos]}`);
    }
  }

  // Budget
  const spent = all.reduce((sum, { player }) => sum + Number(player.price), 0);
  if (spent > settings.budget + 1e-9) {
    errors.push(`Budget exceeded: $${spent.toFixed(1)}m of $${settings.budget.toFixed(1)}m`);
  }

  // Per-nation cap for the stage
  const cap = settings.nation_caps[matchdayLabel];
  if (cap !== undefined) {
    const byNation = new Map<string, number>();
    for (const { player } of all) {
      byNation.set(player.nation, (byNation.get(player.nation) ?? 0) + 1);
    }
    for (const [nation, count] of byNation) {
      if (count > cap) errors.push(`Max ${cap} players from ${nation} (you have ${count})`);
    }
  }

  // Starting XI formation
  const xi = all.filter((r) => r.slot <= 11);
  if (xi.length !== 11) {
    errors.push("Starting XI must have 11 players");
  } else {
    const gk = xi.filter((r) => r.player.position === "GK").length;
    const def = xi.filter((r) => r.player.position === "DEF").length;
    const mid = xi.filter((r) => r.player.position === "MID").length;
    const fwd = xi.filter((r) => r.player.position === "FWD").length;
    const formation = `${def}-${mid}-${fwd}`;
    if (gk !== 1) errors.push("Starting XI must have exactly 1 goalkeeper");
    else if (!settings.formations.includes(formation)) {
      errors.push(
        `Formation ${formation} is not allowed (valid: ${settings.formations.join(", ")})`,
      );
    }
  }

  // Captaincy
  const xiIds = new Set(xi.map((r) => r.playerId));
  if (!xiIds.has(selection.captainId)) errors.push("Captain must be in the starting XI");
  if (!xiIds.has(selection.viceId)) errors.push("Vice-captain must be in the starting XI");
  if (selection.captainId === selection.viceId) {
    errors.push("Captain and vice-captain must be different players");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}
