import {
  validateUsername,
  validateSquad,
  suggestUsernames,
} from "../app/lib/fantasy/validation";
import type {
  FantasyPlayer,
  FantasySettings,
  SquadSelection,
} from "../app/lib/fantasy/types";

describe("validateUsername", () => {
  it.each(["abc", "player_one", "Z1gg3r", "a".repeat(20)])("accepts %s", (name) => {
    expect(validateUsername(name)).toEqual({ ok: true, normalized: name });
  });

  it.each([
    ["ab", "too short"],
    ["a".repeat(21), "too long"],
    ["_lead", "leading underscore"],
    ["trail_", "trailing underscore"],
    ["with space", "space"],
    ["émile", "non-ascii"],
    ["admin", "reserved"],
    ["noblocks", "reserved"],
    ["xXnaziXx", "blocklisted"],
  ])("rejects %s (%s)", (name) => {
    expect(validateUsername(name).ok).toBe(false);
  });

  it("suggests well-formed alternatives", () => {
    for (const suggestion of suggestUsernames("kelechi")) {
      expect(validateUsername(suggestion).ok).toBe(true);
    }
  });
});

// ─── Squad validation ─────────────────────────────────────────────────────────

const settings: FantasySettings = {
  budget: 105,
  squad_size: 15,
  positions: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  formations: ["4-4-2", "4-3-3", "4-5-1", "3-4-3", "3-5-2", "5-4-1", "5-3-2"],
  nation_caps: { MD6: 5, MD7: 6, MD8: 8 },
  free_transfers: { MD6: 4, MD7: 5, MD8: 6 },
  transfer_penalty: 3,
  scoring: {} as FantasySettings["scoring"],
  qualification_deadline: "2026-07-22T23:59:59Z",
  referrals_required: 5,
  referral_min_total_usd: 5,
  cngn_usd_rate: 0.00065,
  campaign_start: "2026-06-01T00:00:00Z",
  campaign_end: "2026-07-19T23:59:59Z",
  features: { emails: false, share_cards: true, join_open: true },
};

/**
 * 15 players: ids 1–2 GK, 3–7 DEF, 8–12 MID, 13–15 FWD, price 5.0 each,
 * spread across nations A–E (3 per nation) so the MD6 cap of 5 passes.
 */
function buildPlayers(): Map<number, FantasyPlayer> {
  const positions = (id: number) =>
    id <= 2 ? "GK" : id <= 7 ? "DEF" : id <= 12 ? "MID" : "FWD";
  const map = new Map<number, FantasyPlayer>();
  for (let id = 1; id <= 15; id++) {
    map.set(id, {
      provider_player_id: id,
      team_id: Math.ceil(id / 3),
      name: `Player ${id}`,
      nation: `Nation ${Math.ceil(id / 3)}`,
      position: positions(id),
      price: 5,
      photo_url: null,
      is_active: true,
    });
  }
  return map;
}

/** Valid 4-4-2: XI = GK 1, DEF 3–6, MID 8–11, FWD 13–14; bench = 2, 7, 12, 15. */
function validSelection(): SquadSelection {
  const xiIds = [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14];
  const benchIds = [2, 7, 12, 15];
  return {
    players: [
      ...xiIds.map((playerId, i) => ({ playerId, slot: i + 1 })),
      ...benchIds.map((playerId, i) => ({ playerId, slot: 12 + i })),
    ],
    captainId: 13,
    viceId: 8,
  };
}

const validate = (selection: SquadSelection, players = buildPlayers()) =>
  validateSquad({ selection, players, settings, matchdayLabel: "MD6" });

describe("validateSquad", () => {
  it("accepts a valid 4-4-2 squad within budget", () => {
    expect(validate(validSelection())).toEqual({ ok: true });
  });

  it("rejects squads that aren't exactly 15 players", () => {
    const selection = validSelection();
    selection.players = selection.players.slice(0, 14);
    expect(validate(selection).ok).toBe(false);
  });

  it("rejects budget overruns", () => {
    const players = buildPlayers();
    players.get(13)!.price = 40; // 14×5 + 40 = 110 > 105
    const result = validate(validSelection(), players);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toMatch(/Budget exceeded/);
  });

  it("enforces the per-nation cap for the stage", () => {
    const players = buildPlayers();
    // 6 players from one nation breaches the MD6 cap of 5
    for (const id of [1, 3, 4, 5, 6, 8]) players.get(id)!.nation = "Brazil";
    const result = validate(validSelection(), players);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toMatch(/Brazil/);
  });

  it("rejects invalid formations", () => {
    const selection = validSelection();
    // Swap a DEF (slot 2 = player 3) with a bench FWD (player 15) → 3-4-3… no,
    // XI becomes DEF 3 / MID 4 / FWD 3 which IS valid, so swap MID instead:
    // remove MID 8 for FWD 15 → 4-3-3 valid too; remove DEF 3 AND MID 8 for
    // FWD 15 + GK 2 → 2 GKs in XI, invalid.
    selection.players = selection.players.map((p) => {
      if (p.playerId === 3) return { playerId: 2, slot: p.slot };
      if (p.playerId === 2) return { playerId: 3, slot: p.slot };
      return p;
    });
    const result = validate(selection);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toMatch(/goalkeeper/);
  });

  it("requires captain and vice in the XI and distinct", () => {
    const sameCaptain = { ...validSelection(), viceId: 13 };
    expect(validate(sameCaptain).ok).toBe(false);

    const benchCaptain = { ...validSelection(), captainId: 15 };
    expect(validate(benchCaptain).ok).toBe(false);
  });

  it("rejects duplicate players", () => {
    const selection = validSelection();
    selection.players[14] = { playerId: 1, slot: 15 };
    expect(validate(selection).ok).toBe(false);
  });
});
