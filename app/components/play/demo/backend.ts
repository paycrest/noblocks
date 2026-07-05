"use client";

/**
 * Noblocks Play — DEMO backend (frontend-only).
 *
 * An in-memory implementation of every /api/play/* endpoint the UI consumes,
 * installed by DemoShell as a window.fetch interceptor. The real pages and
 * components run unmodified against it, and squad rules run through the REAL
 * isomorphic engines (validateSquad, computeTransferCost, computePoints), so
 * what the demo accepts/rejects/scores is what production accepts/rejects/
 * scores. No network, no database, no provider quota.
 *
 * Nothing in the app imports this except the /play-demo route.
 */

import { validateSquad } from "@/app/lib/fantasy/validation";
import {
  computePoints,
  computeSquadPoints,
  computeTransferCost,
  emptyStats,
} from "@/app/lib/fantasy/scoring";
import type {
  FantasyPlayer,
  FantasySettings,
  PlayerMatchStats,
  Position,
} from "@/app/lib/fantasy/types";

/* ------------------------------- Settings ------------------------------- */

/** Mirror of the migration's fantasy_settings.config. */
export const DEMO_SETTINGS: FantasySettings = {
  budget: 105,
  squad_size: 15,
  positions: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  formations: ["4-4-2", "4-3-3", "4-5-1", "3-4-3", "3-5-2", "5-4-1", "5-3-2"],
  nation_caps: { MD6: 5, MD7: 6, MD8: 8 },
  free_transfers: { MD6: 4, MD7: 5, MD8: 6 },
  transfer_penalty: 3,
  scoring: {
    appearance: 1,
    appearance_60: 1,
    assist: 3,
    yellow_card: -1,
    red_card: -2,
    own_goal: -2,
    penalty_won: 2,
    penalty_conceded: -1,
    goal: { GK: 9, DEF: 7, MID: 6, FWD: 5 },
    clean_sheet: { GK: 5, DEF: 5, MID: 1, FWD: 0 },
    goals_conceded_per_extra: { GK: -1, DEF: -1, MID: 0, FWD: 0 },
    penalty_save: 3,
    saves_per_point: 3,
    tackles_per_point: 3,
    key_passes_per_point: 2,
    shots_on_target_per_point: 2,
    direct_free_kick_goal: 1,
  },
  qualification_deadline: "2026-07-22T23:59:59Z",
  referrals_required: 5,
  referral_min_total_usd: 5,
  cngn_usd_rate: 0.00065,
  campaign_start: "2026-07-04T00:00:00Z",
  campaign_end: "2026-07-19T23:59:59Z",
  features: { emails: false, share_cards: true, join_open: true },
};

/* -------------------------------- Players ------------------------------- */

// [2×GK, 3×DEF, 3×MID, 2×FWD] per nation. Names are flavor only.
const NATION_ROSTERS: Record<string, string[]> = {
  Brazil: ["Alisson", "Bento", "Marquinhos", "Militao", "Danilo", "Casemiro", "Paqueta", "Andreas", "Vinicius Jr", "Rodrygo"],
  France: ["Maignan", "Areola", "Saliba", "Upamecano", "Hernandez", "Tchouameni", "Camavinga", "Griezmann", "Mbappe", "Kolo Muani"],
  England: ["Pickford", "Ramsdale", "Stones", "Walker", "Shaw", "Rice", "Bellingham", "Foden", "Kane", "Saka"],
  Spain: ["Unai Simon", "Raya", "Carvajal", "Laporte", "Cucurella", "Rodri", "Pedri", "Olmo", "Yamal", "Morata"],
  Argentina: ["E. Martinez", "Rulli", "Romero", "Otamendi", "Tagliafico", "De Paul", "Mac Allister", "Enzo", "Messi", "J. Alvarez"],
  Germany: ["Neuer", "ter Stegen", "Rudiger", "Tah", "Raum", "Kimmich", "Gundogan", "Wirtz", "Musiala", "Fullkrug"],
  Portugal: ["D. Costa", "Rui Silva", "Ruben Dias", "Pepe", "Cancelo", "Vitinha", "B. Fernandes", "B. Silva", "Ronaldo", "Leao"],
  Morocco: ["Bounou", "Munir", "Hakimi", "Aguerd", "Mazraoui", "Amrabat", "Ounahi", "Ziyech", "En-Nesyri", "Diaz"],
  // Eliminated in the (unscored) previous round — for the airplane flow.
  Netherlands: ["Verbruggen", "Flekken", "Van Dijk", "De Ligt", "Ake", "De Jong", "Simons", "Gakpo", "Depay", "Weghorst"],
  Japan: ["Suzuki", "Gonda", "Tomiyasu", "Itakura", "Sugawara", "Endo", "Kamada", "Kubo", "Mitoma", "Ueda"],
};

const ROSTER_POSITIONS: Position[] = ["GK", "GK", "DEF", "DEF", "DEF", "MID", "MID", "MID", "FWD", "FWD"];
const BASE_PRICE: Record<Position, number> = { GK: 4.5, DEF: 5.0, MID: 5.5, FWD: 6.0 };

const NATIONS = Object.keys(NATION_ROSTERS);
const ELIMINATED_NATIONS = new Set(["Netherlands", "Japan"]);
const teamIdOf = (nation: string) => NATIONS.indexOf(nation) + 1;

function buildPool(): FantasyPlayer[] {
  const players: FantasyPlayer[] = [];
  let id = 1000;
  for (const nation of NATIONS) {
    NATION_ROSTERS[nation].forEach((name, i) => {
      const position = ROSTER_POSITIONS[i];
      // Deterministic spread: stars (last of each position group) cost more.
      const bump = i === 8 ? 4 : i === 6 ? 2.5 : i % 3 === 2 ? 1.5 : i % 2;
      players.push({
        provider_player_id: ++id,
        team_id: teamIdOf(nation),
        name,
        nation,
        position,
        price: Math.min(11, BASE_PRICE[position] + bump),
        photo_url: null, // initials fallback — no external requests in demo
        is_active: true,
      });
    });
  }
  return players;
}

/* ------------------------------- Fixtures ------------------------------- */

interface DemoFixture {
  provider_fixture_id: number;
  home_team_id: number;
  away_team_id: number;
  home_team: string;
  away_team: string;
  kickoff: string;
  status: string; // NS | 1H | HT | 2H | FT
  home_score: number | null;
  away_score: number | null;
  /** Simulated match minute while live. */
  minute: number;
}

const QF_PAIRS: [string, string][] = [
  ["Brazil", "France"],
  ["England", "Spain"],
  ["Argentina", "Germany"],
  ["Portugal", "Morocco"],
];

/* ------------------------------ Scenarios ------------------------------- */

export type DemoScenario =
  | "fresh"
  | "build"
  | "manage"
  | "live"
  | "finalizing"
  | "username-taken";

export const SCENARIOS: Record<
  DemoScenario,
  { title: string; blurb: string; checks: string[] }
> = {
  fresh: {
    title: "New visitor",
    blurb: "Not joined yet. The landing CTA runs the username + join flow.",
    checks: [
      "Join CTA → username modal (availability check, suggestions, T&Cs)",
      "Leaderboard preview loads publicly",
      "My Team asks you to join first",
    ],
  },
  "username-taken": {
    title: "Username race",
    blurb: "Every username is taken — exercise the 409 + suggestions path.",
    checks: ["Modal shows 'taken' + tappable suggestions on submit"],
  },
  build: {
    title: "Initial squad build",
    blurb:
      "Joined, no squad. Round locks in ~4h — free-form building. From here the lifecycle buttons walk the ENTIRE campaign: lock → live games → rollover to the Semis → Final → champion.",
    checks: [
      "XI (4-4-2) on the pitch + 4 bench slots from the start",
      "Budget bar, nation cap (5) and position quotas enforced on save",
      "Autofill produces a valid squad; captain/vice defaults applied",
      "Save, then Jump to lock → Advance → Roll over, repeat to the trophy",
    ],
  },
  manage: {
    title: "Rolled-over squad",
    blurb:
      "Round 2 squad (not initial): lineup edits are free, composition goes through transfers (−3 beyond 4 free). Two squad players' teams were eliminated.",
    checks: [
      "Airplane badge on eliminated players; no swaps or armband for them",
      "Transfer mode: out→in pairs with running −3 cost beyond free",
      "Formation chip updates when you swap bench⇄XI",
    ],
  },
  live: {
    title: "Live round (rolling lockout)",
    blurb:
      "Round locked mid-play: one game finished, one in progress, two later today. Captain hasn't played (vice fallback). Use 'Advance sim' to move time.",
    checks: [
      "Lock chips on in-play players, tick chips on finished ones",
      "Incoming XI player must be pre-kickoff; can't remove mid-match player",
      "Live points tick up on Advance sim (real scoring matrix)",
      "Transfers are closed during the round",
    ],
  },
  finalizing: {
    title: "Round finished (finalizing)",
    blurb: "All games done, stats reconciling. Transfers reopen after rollover.",
    checks: [
      "All players show the played tick with final points",
      "Roll over: losers' players get the airplane badge, squad clones forward with fresh free transfers, rank movement appears on the leaderboard",
    ],
  },
};

/* --------------------------------- State -------------------------------- */

interface DemoState {
  scenario: DemoScenario;
  joined: boolean;
  username: string | null;
  giveawayOptIn: boolean;
  pool: FantasyPlayer[];
  fixtures: DemoFixture[];
  /** 6 = Quarter-finals, 7 = Semi-finals, 8 = Final (+ bronze). */
  matchdayId: number;
  lockAt: string;
  matchdayStatus: "upcoming" | "live" | "finalizing";
  campaignComplete: boolean;
  squad: {
    players: { player_id: number; slot: number; is_captain: boolean; is_vice: boolean }[];
    budget_spent: number;
    free_transfers_remaining: number;
    transfer_points_deduction: number;
    is_initial: boolean;
  } | null;
  stats: Map<number, PlayerMatchStats>;
  totalPoints: number;
  simMinutes: number;
  myRank: number;
  activatedReferrals: number;
  deadline: string;
}

const MATCHDAY_NAMES: Record<number, string> = {
  6: "Quarter-finals",
  7: "Semi-finals",
  8: "Final",
};

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const byId = (pool: FantasyPlayer[]) =>
  new Map(pool.map((p) => [Number(p.provider_player_id), p]));

/** Deterministic valid 15 (2/5/5/3, ≤5 per nation, within budget). */
function pickSquad(pool: FantasyPlayer[], preferNations: string[]) {
  const quotas: Record<Position, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
  const nationCount = new Map<string, number>();
  const chosen: FantasyPlayer[] = [];
  const ordered = [...pool].sort(
    (a, b) =>
      preferNations.indexOf(a.nation) - preferNations.indexOf(b.nation) ||
      Number(a.price) - Number(b.price),
  );
  for (const p of ordered) {
    if (quotas[p.position] <= 0) continue;
    if ((nationCount.get(p.nation) ?? 0) >= 4) continue;
    quotas[p.position]--;
    nationCount.set(p.nation, (nationCount.get(p.nation) ?? 0) + 1);
    chosen.push(p);
    if (chosen.length === 15) break;
  }
  // XI = 1 GK, 4 DEF, 4 MID, 2 FWD; bench = the rest (matches build default).
  const xiQuota: Record<Position, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };
  const xi: FantasyPlayer[] = [];
  const bench: FantasyPlayer[] = [];
  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    for (const p of chosen.filter((c) => c.position === pos)) {
      if (xi.filter((x) => x.position === pos).length < xiQuota[pos]) xi.push(p);
      else bench.push(p);
    }
  }
  const players = [
    ...xi.map((p, i) => ({
      player_id: Number(p.provider_player_id),
      slot: i + 1,
      is_captain: i === 9, // an XI forward
      is_vice: i === 6, // an XI midfielder
    })),
    ...bench.map((p, i) => ({
      player_id: Number(p.provider_player_id),
      slot: i + 12,
      is_captain: false,
      is_vice: false,
    })),
  ];
  const budget = chosen.reduce((s, p) => s + Number(p.price), 0);
  return { players, budget: Math.round(budget * 10) / 10 };
}

function makeFixtures(scenario: DemoScenario): { fixtures: DemoFixture[]; lockAt: string } {
  const mk = (i: number, kickoffH: number): DemoFixture => ({
    provider_fixture_id: 9000 + i,
    home_team_id: teamIdOf(QF_PAIRS[i][0]),
    away_team_id: teamIdOf(QF_PAIRS[i][1]),
    home_team: QF_PAIRS[i][0],
    away_team: QF_PAIRS[i][1],
    kickoff: hoursFromNow(kickoffH),
    status: "NS",
    home_score: null,
    away_score: null,
    minute: 0,
  });

  if (scenario === "live") {
    const fixtures = [mk(0, -5), mk(1, -1.2), mk(2, 2), mk(3, 5)];
    fixtures[0].status = "FT";
    fixtures[0].home_score = 2;
    fixtures[0].away_score = 1;
    fixtures[0].minute = 90;
    fixtures[1].status = "2H";
    fixtures[1].home_score = 1;
    fixtures[1].away_score = 1;
    fixtures[1].minute = 67;
    return { fixtures, lockAt: hoursFromNow(-6) };
  }
  if (scenario === "finalizing") {
    const fixtures = QF_PAIRS.map((_, i) => mk(i, -10 + i));
    for (const f of fixtures) {
      f.status = "FT";
      f.home_score = (f.provider_fixture_id % 3) as number;
      f.away_score = (f.provider_fixture_id % 2) as number;
      f.minute = 90;
    }
    return { fixtures, lockAt: hoursFromNow(-14) };
  }
  // Pre-lock scenarios: all upcoming, lock in ~4h.
  return { fixtures: QF_PAIRS.map((_, i) => mk(i, 4 + i * 3)), lockAt: hoursFromNow(4) };
}

/** Scripted match stats so live points come from the REAL scoring matrix. */
function seedLiveStats(state: DemoState) {
  const players = state.pool;
  const inFixture = (p: FantasyPlayer, f: DemoFixture) =>
    p.team_id === f.home_team_id || p.team_id === f.away_team_id;

  for (const f of state.fixtures) {
    if (f.status === "NS") continue;
    for (const p of players.filter((pl) => inFixture(pl, f))) {
      const id = Number(p.provider_player_id);
      const s = emptyStats();
      const idx = id % 10;
      // The demo squad's captain sits out fixture 0 → vice fallback visible.
      const isCaptain = state.squad?.players.some(
        (sp) => sp.player_id === id && sp.is_captain,
      );
      s.minutes = isCaptain ? 0 : f.status === "FT" ? (idx === 9 ? 0 : 90) : f.minute;
      if (s.minutes > 0) {
        if (idx === 8) s.goals = 1; // one scorer per team row
        if (idx === 6) s.assists = 1;
        if (idx === 5) s.tackles = 6;
        if (idx <= 1 && p.position === "GK") s.saves = 4;
        s.cleanSheet =
          s.minutes >= 60 &&
          ((p.team_id === f.home_team_id && (f.away_score ?? 0) === 0) ||
            (p.team_id === f.away_team_id && (f.home_score ?? 0) === 0));
        s.goalsConceded =
          p.team_id === f.home_team_id ? (f.away_score ?? 0) : (f.home_score ?? 0);
      }
      state.stats.set(id, s);
    }
  }
}

function buildState(scenario: DemoScenario): DemoState {
  const pool = buildPool();
  const bracketKnown = scenario !== "fresh"; // QF bracket published
  if (bracketKnown) {
    for (const p of pool) {
      if (ELIMINATED_NATIONS.has(p.nation)) p.is_active = false;
    }
  }
  const { fixtures, lockAt } = makeFixtures(scenario);

  const state: DemoState = {
    scenario,
    joined: scenario !== "fresh" && scenario !== "username-taken",
    username: scenario === "fresh" || scenario === "username-taken" ? null : "demo_manager",
    giveawayOptIn: true,
    pool,
    fixtures,
    matchdayId: 6,
    lockAt,
    matchdayStatus:
      scenario === "live" ? "live" : scenario === "finalizing" ? "finalizing" : "upcoming",
    campaignComplete: false,
    squad: null,
    stats: new Map(),
    totalPoints: 0,
    simMinutes: 0,
    myRank: 12,
    activatedReferrals: 3,
    deadline: DEMO_SETTINGS.qualification_deadline,
  };

  if (scenario === "manage" || scenario === "live" || scenario === "finalizing") {
    // Includes two players whose teams were eliminated last round (manage).
    const prefer =
      scenario === "manage"
        ? ["Netherlands", "Japan", "Brazil", "France", "England", "Spain"]
        : ["Brazil", "France", "England", "Spain", "Argentina"];
    const activePool =
      scenario === "manage"
        ? pool // eliminated players allowed to REMAIN in a rolled-over squad
        : pool.filter((p) => p.is_active);
    const { players, budget } = pickSquad(activePool, prefer);
    state.squad = {
      players,
      budget_spent: budget,
      free_transfers_remaining: 4,
      transfer_points_deduction: scenario === "live" ? 3 : 0,
      is_initial: false,
    };
    // Baseline from previous rounds — THIS round's points are computed live
    // from the squad's stats via computeSquadPoints (see totalPointsNow).
    state.totalPoints = 34;
  }

  if (scenario === "live" || scenario === "finalizing") seedLiveStats(state);
  return state;
}

/* ------------------------------ The backend ------------------------------ */

const TAKEN_USERNAMES = new Set(["onyemaechi", "noblocks", "prof", "demo"]);

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const err = (error: string, status: number, extra?: Record<string, unknown>) =>
  new Response(JSON.stringify({ success: false, error, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export class DemoBackend {
  state: DemoState;
  /** Bumped on every mutation — DemoShell shows it in the event log. */
  log: string[] = [];

  constructor(scenario: DemoScenario) {
    this.state = buildState(scenario);
  }

  private note(entry: string) {
    this.log = [
      `${new Date().toLocaleTimeString()} — ${entry}`,
      ...this.log,
    ].slice(0, 30);
  }

  get label() {
    return `MD${this.state.matchdayId}`;
  }

  get matchday() {
    return {
      id: this.state.matchdayId,
      label: this.label,
      round: MATCHDAY_NAMES[this.state.matchdayId],
      display_name: MATCHDAY_NAMES[this.state.matchdayId],
      lock_at: this.state.lockAt,
      status: this.state.matchdayStatus,
    };
  }

  get locked() {
    return Date.now() >= new Date(this.state.lockAt).getTime();
  }

  /** Lifecycle fast-forward: skip the wait and lock the current round. */
  jumpToLock() {
    const s = this.state;
    s.lockAt = new Date(Date.now() - 60_000).toISOString();
    s.matchdayStatus = "live";
    this.note(`${MATCHDAY_NAMES[s.matchdayId]} locked — advance the sim for kickoffs`);
  }

  /**
   * Round rollover — the demo mirror of the worker's live→finalizing step:
   * bank the round's points, flag the losers' players inactive, clone the
   * squad into the next round (is_initial=false, fresh free transfers, no
   * deduction), snapshot rank movement, and build the next round's fixtures
   * from the winners.
   */
  rollover() {
    const s = this.state;
    const bankedTotal = this.totalPointsNow();
    const roundPoints = bankedTotal - s.totalPoints;
    s.totalPoints = bankedTotal;

    if (s.matchdayId >= 8) {
      s.campaignComplete = true;
      this.note(`CHAMPIONS — campaign complete. Final round scored ${roundPoints} pts; winners export time!`);
      return;
    }

    const winners: number[] = [];
    const losers: number[] = [];
    for (const f of s.fixtures) {
      const homeWins = (f.home_score ?? 0) >= (f.away_score ?? 0);
      winners.push(homeWins ? f.home_team_id : f.away_team_id);
      losers.push(homeWins ? f.away_team_id : f.home_team_id);
    }
    for (const p of s.pool) {
      if (losers.includes(p.team_id)) p.is_active = false;
    }

    s.matchdayId += 1;
    const nameOf = (id: number) => NATIONS[id - 1];
    const mkNext = (i: number, home: number, away: number, kickoffH: number): DemoFixture => ({
      provider_fixture_id: 9100 + s.matchdayId * 10 + i,
      home_team_id: home,
      away_team_id: away,
      home_team: nameOf(home),
      away_team: nameOf(away),
      kickoff: hoursFromNow(kickoffH),
      status: "NS",
      home_score: null,
      away_score: null,
      minute: 0,
    });
    s.fixtures =
      s.matchdayId === 7
        ? [mkNext(0, winners[0], winners[1], 5), mkNext(1, winners[2], winners[3], 8)]
        : [mkNext(0, losers[0], losers[1], 5), mkNext(1, winners[0], winners[1], 8)]; // bronze + final
    s.lockAt = hoursFromNow(4);
    s.matchdayStatus = "upcoming";
    s.stats = new Map();
    s.simMinutes = 0;

    if (s.squad) {
      s.squad.is_initial = false;
      s.squad.free_transfers_remaining =
        DEMO_SETTINGS.free_transfers[this.label] ?? 0;
      s.squad.transfer_points_deduction = 0;
    }
    const previousRank = s.myRank;
    s.myRank = Math.max(1, s.myRank - 3);
    this.note(
      `Rolled over to the ${MATCHDAY_NAMES[s.matchdayId]} (+${roundPoints} pts, rank ${previousRank}→${s.myRank}). ` +
        `Squad cloned with ${s.squad?.free_transfers_remaining ?? 0} free transfers; eliminated teams flagged as flown home.`,
    );
  }

  /** Simulate a referred friend crossing the cumulative $5 threshold. */
  activateReferral() {
    const s = this.state;
    if (s.activatedReferrals >= DEMO_SETTINGS.referrals_required) return;
    s.activatedReferrals += 1;
    this.note(
      `Referral activated (${s.activatedReferrals}/${DEMO_SETTINGS.referrals_required})${
        s.activatedReferrals >= DEMO_SETTINGS.referrals_required ? " — QUALIFIED" : ""
      }`,
    );
  }

  /** Simulate the qualification deadline passing. */
  expireDeadline() {
    this.state.deadline = new Date(Date.now() - 60_000).toISOString();
    this.note("Qualification deadline passed — opt-in toggle now rejects");
  }

  private lockStateOf(teamId: number): "unlocked" | "locked" | "played" {
    const f = this.state.fixtures.find(
      (fx) => fx.home_team_id === teamId || fx.away_team_id === teamId,
    );
    if (!f) return "unlocked";
    if (f.status === "FT") return "played";
    if (f.status === "NS") return "unlocked";
    return "locked";
  }

  private liveOf(playerId: number) {
    const s = this.state.stats.get(playerId);
    if (!s) return { points: 0, minutes: 0 };
    const player = byId(this.state.pool).get(playerId);
    if (!player) return { points: 0, minutes: 0 };
    return {
      points: computePoints(s, player.position, DEMO_SETTINGS.scoring).points,
      minutes: s.minutes,
    };
  }

  /**
   * Participant total = previous-rounds baseline + THIS round's squad score
   * from the real aggregator (captain double, unconditional vice fallback,
   * bench excluded, transfer deduction) — so the Total chip always agrees
   * with the per-player live points on screen.
   */
  private totalPointsNow(): number {
    const s = this.state;
    if (!s.squad) return s.totalPoints;
    const playerPoints = new Map(
      s.squad.players.map((p) => [p.player_id, this.liveOf(p.player_id)] as const),
    );
    const roundPoints = computeSquadPoints({
      startingXI: s.squad.players
        .filter((p) => p.slot <= 11)
        .map((p) => ({
          playerId: p.player_id,
          isCaptain: p.is_captain,
          isVice: p.is_vice,
        })),
      playerPoints,
      transferPointsDeduction: s.squad.transfer_points_deduction,
    });
    return s.totalPoints + roundPoints;
  }

  /** "Advance sim" — the demo's stand-in for the scoring worker's tick. */
  advance() {
    const s = this.state;
    s.simMinutes += 15;
    const squadXi = new Set(
      (s.squad?.players ?? []).filter((p) => p.slot <= 11).map((p) => p.player_id),
    );

    for (const f of s.fixtures) {
      if (f.status === "FT") continue;
      const kickoffMs = new Date(f.kickoff).getTime();
      if (f.status === "NS") {
        // Advancing sim time pulls the next kickoff closer artificially.
        f.kickoff = new Date(kickoffMs - 45 * 60_000).toISOString();
        if (new Date(f.kickoff).getTime() <= Date.now()) {
          f.status = "1H";
          f.minute = 1;
          f.home_score = 0;
          f.away_score = 0;
          this.note(`Kickoff: ${f.home_team} vs ${f.away_team}`);
        }
        continue;
      }
      f.minute += 15;
      // Everyone on pitch accrues minutes FIRST (so a fresh kickoff's
      // players are on the pitch before the goal script runs).
      for (const p of s.pool) {
        if (p.team_id !== f.home_team_id && p.team_id !== f.away_team_id) continue;
        const stats = s.stats.get(Number(p.provider_player_id)) ?? emptyStats();
        if (stats.minutes > 0 || f.minute <= 16) {
          stats.minutes = Math.min(90, stats.minutes + 15 || 15);
        }
        s.stats.set(Number(p.provider_player_id), stats);
      }
      // Scripted goal — preferentially by one of YOUR XI players on the
      // scoring team, so per-player live points visibly move on the pitch.
      const scorerTeam = f.minute % 30 === 0 ? f.home_team_id : f.away_team_id;
      const onPitch = (p: FantasyPlayer) =>
        (this.state.stats.get(Number(p.provider_player_id))?.minutes ?? 0) > 0;
      const teamPlayers = s.pool.filter((p) => p.team_id === scorerTeam && onPitch(p));
      const scorer =
        teamPlayers.find(
          (p) => squadXi.has(Number(p.provider_player_id)) && p.position !== "GK",
        ) ?? teamPlayers.find((p) => Number(p.provider_player_id) % 10 === 8);
      const assister = teamPlayers.find(
        (p) => p !== scorer && (squadXi.has(Number(p.provider_player_id)) || Number(p.provider_player_id) % 10 === 7),
      );
      if (scorer && f.minute <= 90) {
        if (scorerTeam === f.home_team_id) f.home_score = (f.home_score ?? 0) + 1;
        else f.away_score = (f.away_score ?? 0) + 1;
        const stats = s.stats.get(Number(scorer.provider_player_id)) ?? emptyStats();
        stats.goals += 1;
        s.stats.set(Number(scorer.provider_player_id), stats);
        if (assister) {
          const aStats = s.stats.get(Number(assister.provider_player_id)) ?? emptyStats();
          aStats.assists += 1;
          s.stats.set(Number(assister.provider_player_id), aStats);
        }
        // The conceding side loses clean sheets and racks up goals against
        // (GK/DEF points visibly drop — same as the real matrix).
        const concedingTeam = scorerTeam === f.home_team_id ? f.away_team_id : f.home_team_id;
        for (const p of s.pool) {
          if (p.team_id !== concedingTeam) continue;
          const st = s.stats.get(Number(p.provider_player_id));
          if (st && st.minutes > 0) {
            st.goalsConceded += 1;
            st.cleanSheet = false;
          }
        }
        this.note(`GOAL — ${scorer.name} (${f.home_team} ${f.home_score}–${f.away_score} ${f.away_team})`);
      }
      if (f.minute >= 90) {
        f.status = "FT";
        this.note(`FT: ${f.home_team} ${f.home_score}–${f.away_score} ${f.away_team}`);
      }
    }
    if (s.fixtures.every((f) => f.status === "FT") && s.matchdayStatus === "live") {
      s.matchdayStatus = "finalizing";
      this.note("All games finished — round finalizing (rollover next)");
    }
  }

  /* ------------------------------ Routing ------------------------------ */

  async handle(url: URL, init?: RequestInit): Promise<Response | null> {
    const path = url.pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const s = this.state;

    if (path === "/api/referral/referral-data") {
      return ok({ referral_code: "NBDEMO", referrals: [] });
    }
    if (!path.startsWith("/api/play/")) return null;

    if (path === "/api/play/players") {
      return ok({
        players: s.pool,
        settings: {
          budget: DEMO_SETTINGS.budget,
          squad_size: DEMO_SETTINGS.squad_size,
          positions: DEMO_SETTINGS.positions,
          formations: DEMO_SETTINGS.formations,
          nation_cap: DEMO_SETTINGS.nation_caps[this.label] ?? null,
          transfer_penalty: DEMO_SETTINGS.transfer_penalty,
        },
        matchday: this.matchday,
      });
    }

    if (path.startsWith("/api/play/matchday/")) {
      return ok({
        matchday: this.matchday,
        fixtures: s.fixtures.map(({ minute: _minute, ...f }) => f),
      });
    }

    if (path === "/api/play/leaderboard") {
      return this.leaderboard(url);
    }

    if (path === "/api/play/username/check") {
      const u = (url.searchParams.get("u") ?? "").toLowerCase();
      const taken = s.scenario === "username-taken" || TAKEN_USERNAMES.has(u);
      return ok(
        taken
          ? {
              available: false,
              reason: "That username is taken",
              suggestions: [`${u}_wc26`, `${u}${Math.floor(Math.random() * 90) + 10}`, `real_${u}`],
            }
          : { available: true },
      );
    }

    if (path === "/api/play/join" && method === "POST") {
      const username = String(body?.username ?? "").toLowerCase();
      if (s.scenario === "username-taken" || TAKEN_USERNAMES.has(username)) {
        return err("Username is taken", 409, {
          suggestions: [`${username}_wc26`, `${username}9`, `real_${username}`],
        });
      }
      s.joined = true;
      s.username = username;
      s.giveawayOptIn = Boolean(body?.giveawayOptIn);
      this.note(`Joined the league as @${username}`);
      return ok({ joined: true, already_joined: false, username });
    }

    // Everything below requires a joined participant.
    if (!s.joined) return err("Join the league first", 403, { code: "NOT_JOINED" });

    if (path === "/api/play/squad" && method === "GET") {
      return ok(this.squadResponse());
    }
    if (path === "/api/play/squad" && method === "PUT") {
      return this.saveSquad(body);
    }
    if (path === "/api/play/transfers" && method === "POST") {
      return this.transfers(body);
    }
    if (path === "/api/play/rewards") {
      return ok(this.rewards());
    }
    if (path === "/api/play/opt-in" && method === "POST") {
      if (Date.now() > new Date(s.deadline).getTime()) {
        return err("The qualification deadline has passed", 400);
      }
      s.giveawayOptIn = Boolean(body?.optIn);
      this.note(`Giveaway opt-in → ${s.giveawayOptIn}`);
      return ok({ giveaway_opt_in: s.giveawayOptIn });
    }

    return err("Not found (demo)", 404);
  }

  private squadResponse() {
    const s = this.state;
    const players = byId(s.pool);
    return {
      matchday: this.matchday,
      locked: this.locked,
      squad: s.squad
        ? {
            id: "demo-squad",
            wallet_address: "0xdemo",
            matchday_id: s.matchdayId,
            ...s.squad,
            players: s.squad.players.map((entry) => {
              const player = players.get(entry.player_id);
              return {
                ...entry,
                player,
                lock_state: player ? this.lockStateOf(player.team_id) : "unlocked",
                live: this.liveOf(entry.player_id),
              };
            }),
          }
        : null,
      free_transfers: DEMO_SETTINGS.free_transfers[this.label] ?? 0,
      total_points: this.totalPointsNow(),
    };
  }

  /** Mirrors PUT /api/play/squad (real validateSquad + lock rules). */
  private saveSquad(body: {
    players: { playerId: number; slot: number }[];
    captainId: number;
    viceId: number;
  } | null) {
    const s = this.state;
    if (!body) return err("Invalid request body", 400);
    const players = byId(s.pool);
    const selection = {
      players: body.players.map((p) => ({ playerId: Number(p.playerId), slot: Number(p.slot) })),
      captainId: Number(body.captainId),
      viceId: Number(body.viceId),
    };

    const validation = validateSquad({
      selection,
      players,
      settings: DEMO_SETTINGS,
      matchdayLabel: this.label,
    });
    if (!validation.ok) return err("Invalid squad", 400, { errors: validation.errors });

    const newIds = new Set(selection.players.map((p) => p.playerId));
    const existing = s.squad;

    if (!existing) {
      if (this.locked) return err("This round is locked — you can join the next one", 403, { code: "ROUND_LOCKED" });
      for (const id of newIds) {
        if (!players.get(id)?.is_active) return err("Squad contains players from eliminated teams", 400);
      }
    } else {
      const oldIds = new Set(existing.players.map((p) => p.player_id));
      const compositionChanged =
        newIds.size !== oldIds.size || [...newIds].some((id) => !oldIds.has(id));
      if (!this.locked) {
        if (compositionChanged && !existing.is_initial) {
          return err("Use transfers to change your squad after your first round", 400, { code: "USE_TRANSFERS" });
        }
      } else {
        if (compositionChanged) return err("Transfers are closed during a live round", 403, { code: "ROUND_LOCKED" });
        const state = (id: number) => {
          const p = players.get(id);
          return p ? this.lockStateOf(p.team_id) : "unlocked";
        };
        const oldSlots = new Map(existing.players.map((p) => [p.player_id, p.slot]));
        for (const { playerId, slot } of selection.players) {
          const oldSlot = oldSlots.get(playerId)!;
          const wasXI = oldSlot <= 11;
          const isXI = slot <= 11;
          if (wasXI === isXI) continue;
          if (isXI && state(playerId) !== "unlocked") {
            return err("A player can only come into your XI before their match kicks off", 403, { code: "PLAYER_LOCKED" });
          }
          if (!isXI && state(playerId) === "locked") {
            return err("You can't remove a player while their match is in progress", 403, { code: "PLAYER_LOCKED" });
          }
        }
        const oldCaptain = existing.players.find((p) => p.is_captain)?.player_id;
        if (oldCaptain !== selection.captainId) {
          const played = (this.liveOf(selection.captainId).minutes ?? 0) > 0;
          if (state(selection.captainId) !== "unlocked" || played) {
            return err("New captain must not have played yet", 403, { code: "CAPTAIN_LOCKED" });
          }
        }
      }
    }

    const budget = selection.players.reduce(
      (sum, { playerId }) => sum + Number(players.get(playerId)?.price ?? 0),
      0,
    );
    s.squad = {
      players: selection.players.map(({ playerId, slot }) => ({
        player_id: playerId,
        slot,
        is_captain: playerId === selection.captainId,
        is_vice: playerId === selection.viceId,
      })),
      budget_spent: Math.round(budget * 10) / 10,
      free_transfers_remaining: existing?.free_transfers_remaining ?? (DEMO_SETTINGS.free_transfers.MD6 ?? 0),
      transfer_points_deduction: existing?.transfer_points_deduction ?? 0,
      is_initial: existing?.is_initial ?? true,
    };
    this.note("Squad saved (validated by the real engine)");
    return ok({ squad: this.squadResponse().squad });
  }

  /** Mirrors POST /api/play/transfers (real cost + resulting-squad checks). */
  private transfers(body: { transfers: { out: number; in: number }[] } | null) {
    const s = this.state;
    const transfers = body?.transfers ?? [];
    if (!s.squad) return err("Build a squad first", 400);
    if (s.squad.is_initial) return err("Initial squads edit freely — no transfers needed", 400);
    if (this.locked) return err("Transfers are closed during a live round", 403, { code: "ROUND_LOCKED" });
    if (transfers.length === 0) return err("No transfers supplied", 400);

    const players = byId(s.pool);
    const updated = s.squad.players.map((p) => ({ ...p }));
    for (const t of transfers) {
      const idx = updated.findIndex((p) => p.player_id === Number(t.out));
      if (idx < 0) return err("Transfer-out player is not in your squad", 400);
      if (!players.get(Number(t.in))?.is_active) {
        return err("Incoming player's team is eliminated", 400);
      }
      updated[idx] = { ...updated[idx], player_id: Number(t.in) };
    }
    const validation = validateSquad({
      selection: {
        players: updated.map((p) => ({ playerId: p.player_id, slot: p.slot })),
        captainId: updated.find((p) => p.is_captain)?.player_id ?? 0,
        viceId: updated.find((p) => p.is_vice)?.player_id ?? 0,
      },
      players,
      settings: DEMO_SETTINGS,
      matchdayLabel: this.label,
    });
    if (!validation.ok) {
      return err("Transfers would make your squad invalid", 400, { errors: validation.errors });
    }

    const { freeUsed, pointsCost } = computeTransferCost(
      transfers.length,
      s.squad.free_transfers_remaining,
      DEMO_SETTINGS.transfer_penalty,
    );
    s.squad.players = updated;
    s.squad.free_transfers_remaining -= freeUsed;
    s.squad.transfer_points_deduction += pointsCost;
    s.squad.budget_spent =
      Math.round(updated.reduce((sum, p) => sum + Number(players.get(p.player_id)?.price ?? 0), 0) * 10) / 10;
    this.note(`${transfers.length} transfer(s) applied — cost ${pointsCost} pts`);
    return ok({
      applied: transfers.length,
      free_transfers_remaining: s.squad.free_transfers_remaining,
      points_cost: pointsCost,
      total_deduction: s.squad.transfer_points_deduction,
    });
  }

  private leaderboard(url: URL) {
    const s = this.state;
    const pageSize = 25;
    const total = 87;
    const myRank = s.myRank;
    const names = ["kwame", "zara", "tunde", "amaka", "kofi", "chidi", "lola", "emeka", "sade", "obi"];
    const findMe = url.searchParams.get("find") === "me" && s.joined;
    let page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    if (findMe) page = Math.ceil(myRank / pageSize);

    const myBadge =
      s.activatedReferrals >= DEMO_SETTINGS.referrals_required && s.giveawayOptIn
        ? "qualified"
        : s.giveawayOptIn
          ? "in_progress"
          : "opted_out";

    const rows = Array.from({ length: pageSize }, (_, i) => {
      const rank = (page - 1) * pageSize + i + 1;
      if (rank > total) return null;
      const isMe = s.joined && rank === myRank;
      return {
        rank,
        username: isMe ? (s.username ?? "demo_manager") : `${names[rank % names.length]}${rank}`,
        total_points: isMe ? this.totalPointsNow() : Math.max(0, 190 - rank * 2 - (rank % 3)),
        badge: (isMe
          ? myBadge
          : rank % 7 === 0
            ? "opted_out"
            : rank % 3 === 0
              ? "qualified"
              : "in_progress") as "qualified" | "in_progress" | "opted_out",
        // Movement snapshots at rollover: self climbs 3 per completed round.
        movement: isMe ? 12 - myRank : ((rank * 13) % 7) - 3,
        is_me: isMe,
      };
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    return ok({ rows, page, page_size: pageSize, total });
  }

  private rewards() {
    const s = this.state;
    // Derived from the sim's activated count so "+1 activated referral"
    // walks the full 0→qualified journey, including the crossing amounts.
    const activatedAmounts = [12.5, 9.4, 5.0, 7.2, 6.1];
    const wallets = ["0x3f21…9be0", "0x88ac…1d77", "0xd014…52a3", "0x27e9…c4f8", "0xb3b1…08aa"];
    const referrals = wallets.map((wallet_short, i) => {
      const activated = i < s.activatedReferrals;
      return {
        wallet_short,
        signed_up_at: hoursFromNow(-70 + i * 16),
        total_tx_usd: activated ? activatedAmounts[i] : i === s.activatedReferrals ? 4.2 : 0,
        activated,
      };
    });
    return {
      required: DEMO_SETTINGS.referrals_required,
      min_total_usd: DEMO_SETTINGS.referral_min_total_usd,
      activated: Math.min(s.activatedReferrals, wallets.length),
      referrals,
      qualified:
        s.activatedReferrals >= DEMO_SETTINGS.referrals_required && s.giveawayOptIn,
      giveaway_opt_in: s.giveawayOptIn,
      deadline: s.deadline,
      rank: s.joined ? s.myRank : null,
      total_points: this.totalPointsNow(),
    };
  }
}
