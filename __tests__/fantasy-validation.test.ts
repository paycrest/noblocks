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

const settings: FantasySettings = {
  budget: 100,
  squad_size: 15,
  positions: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  formations: ["4-4-2", "4-3-3", "4-5-1", "3-4-3", "3-5-2", "5-4-1", "5-3-2"],
  club_cap: 3,
  free_transfers_max: 5,
  transfer_penalty: 4,
  season_matchday_min: 101,
  season_matchday_max: 138,
  photos_enabled: false,
  defcon_def_threshold: 5,
  defcon_mid_fwd_threshold: 6,
  scoring: {} as FantasySettings["scoring"],
  campaign_start: "2026-08-01T00:00:00Z",
  campaign_end: "2027-05-31T00:00:00Z",
  features: { emails: false, share_cards: true, join_open: true },
};

/**
 * 15 players: ids 1–2 GK, 3–7 DEF, 8–12 MID, 13–15 FWD, price 5.0 each,
 * team_id = ceil(id/3) so at most 3 per club.
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
      nation: `Club ${Math.ceil(id / 3)}`,
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
  validateSquad({ selection, players, settings });

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
    players.get(13)!.price = 40; // 14×5 + 40 = 110 > 100
    const result = validate(validSelection(), players);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toMatch(/Budget exceeded/);
  });

  it("enforces the per-club cap", () => {
    const players = buildPlayers();
    // Force 4 players onto the same club (cap 3).
    for (const id of [1, 3, 4, 5]) players.get(id)!.team_id = 99;
    const result = validate(validSelection(), players);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toMatch(/club|Club|3/i);
  });

  it("rejects invalid formations", () => {
    const selection = validSelection();
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
