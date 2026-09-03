import type { Position } from "./types";
import type { SquadPlayerRow } from "./scoring";

function countOutfield(xi: SquadPlayerRow[]): { def: number; mid: number; fwd: number; gk: number } {
  let def = 0,
    mid = 0,
    fwd = 0,
    gk = 0;
  for (const p of xi) {
    if (p.position === "GK") gk++;
    else if (p.position === "DEF") def++;
    else if (p.position === "MID") mid++;
    else fwd++;
  }
  return { def, mid, fwd, gk };
}

/** FPL floors after a proposed outfield sub: 1 GK, ≥3 DEF, ≥1 FWD, 11 players. */
function formationOk(xi: SquadPlayerRow[]): boolean {
  if (xi.length !== 11) return false;
  const { def, fwd, gk } = countOutfield(xi);
  return gk === 1 && def >= 3 && fwd >= 1;
}

/**
 * Automatic substitutions at end of GW (FPL rules).
 * Bench order = slots 12–15. Process against evolving XI.
 * GK only replaced by GK. Outfield: highest-priority bench who played and
 * keeps formation floors (not like-for-like). Skip higher bench if entry breaks formation.
 *
 * The armband NEVER transfers to the incoming player: FPL passes captaincy
 * captain → vice only. computeSquadPoints reads C/VC from the original squad
 * rows, so incoming bench players keep their own (false) flags here.
 */
export function applyAutoSubs(
  squad: SquadPlayerRow[],
  played: (playerId: number) => boolean,
): SquadPlayerRow[] {
  const sorted = [...squad].sort((a, b) => a.slot - b.slot);
  let xi = sorted.filter((p) => p.slot <= 11);
  const bench = sorted.filter((p) => p.slot >= 12);

  // GK
  const gk = xi.find((p) => p.position === "GK");
  if (gk && !played(gk.playerId)) {
    const subGk = bench.find((p) => p.position === "GK" && played(p.playerId));
    if (subGk) {
      xi = xi.map((p) => (p.playerId === gk.playerId ? { ...subGk, slot: gk.slot } : p));
    }
  }

  // Outfield — repeat until no more legal subs
  let changed = true;
  const usedBench = new Set<number>();
  // If GK was subbed, mark that bench player used
  for (const b of bench) {
    if (xi.some((x) => x.playerId === b.playerId)) usedBench.add(b.playerId);
  }

  while (changed) {
    changed = false;
    const blank = xi.filter((p) => p.position !== "GK" && !played(p.playerId));
    if (blank.length === 0) break;

    for (const out of blank) {
      for (const candidate of bench) {
        if (usedBench.has(candidate.playerId)) continue;
        if (candidate.position === "GK") continue;
        if (!played(candidate.playerId)) continue;

        const trial = xi.map((p) =>
          p.playerId === out.playerId ? { ...candidate, slot: out.slot } : p,
        );
        if (!formationOk(trial)) continue;

        xi = trial;
        usedBench.add(candidate.playerId);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }

  return xi;
}

/**
 * UI slot for every picked player after settled auto-subs. The scorer copies
 * an incoming bench player into the replaced starter's slot; this mirrors the
 * other half of that swap by moving the displaced starter into the incoming
 * player's original bench slot.
 */
export function autoSubDisplaySlots(
  squad: SquadPlayerRow[],
  scoringXi: SquadPlayerRow[],
): Map<number, number> {
  const originalById = new Map(squad.map((player) => [player.playerId, player]));
  const originalBySlot = new Map(squad.map((player) => [player.slot, player]));
  const displaySlots = new Map(squad.map((player) => [player.playerId, player.slot]));

  for (const scoringPlayer of scoringXi) {
    const original = originalById.get(scoringPlayer.playerId);
    if (!original || original.slot <= 11 || scoringPlayer.slot > 11) continue;

    const displaced = originalBySlot.get(scoringPlayer.slot);
    displaySlots.set(scoringPlayer.playerId, scoringPlayer.slot);
    if (displaced) displaySlots.set(displaced.playerId, original.slot);
  }

  return displaySlots;
}

export type { Position };
