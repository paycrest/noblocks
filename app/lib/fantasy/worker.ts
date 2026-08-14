import "server-only";
import { FINISHED_STATUSES, getProviderRateLimit } from "./provider";
import { getFantasySettings } from "./settings";
import { getPlayersMap } from "./players";
import { nextMatchday, type MatchdayRow } from "./server";
import { isEmailConfigured } from "./notifications";
import { resolveChallengesForGameweek } from "./challenges";
import {
  advanceTimelapseFixtures,
  checkFrozenDeadlinePostponements,
  isTimelapseFixtureId,
  isWindowActive,
  loadFixtures,
  loadMatchdays,
  refreshFixturesFromProvider,
  setMatchdayStatus,
  statsSyncDue,
  syncFixtureStats,
  syncTimelapseFixtureStats,
} from "./worker/fixtures";
import {
  clearPendingRescore,
  recomputeScores,
  releaseWorkerRun,
  tryAcquireWorkerRun,
} from "./worker/scoring";
import { rolloverMatchday } from "./worker/rollover";
import { sendNotifications } from "./worker/notify";
import type { FixtureRow, StatsPass, WorkerReport } from "./types";

const FIXTURE_REFRESH_MINUTES = 15;
/**
 * LOCAL ONLY — pair with SEED_TIMELAPSE_HOURS on scripts/seed-fantasy.ts.
 * Skips API-Football fixture refresh, clock-advances synthetic fixtures, and
 * writes deterministic player stats so lock → live → FT → score → rollover
 * can be demoed without waiting on real EPL kickoffs.
 *
 * HARD-GATED on NODE_ENV: fabricated stats feed real scores and payout
 * decisions, so the env var alone must never be able to enable this in a
 * production deployment.
 */
const LOCAL_TIMELAPSE =
  process.env.NODE_ENV !== "production" &&
  (process.env.FANTASY_LOCAL_TIMELAPSE ?? "").toLowerCase() === "true";

export type { WorkerReport } from "./types";
export { recomputeScores } from "./worker/scoring";

/**
 * Scoring worker (TRD §3): the single writer for fixtures, stats, points,
 * ranks and rollovers. Invoked on a schedule by the Cloudflare worker via
 * POST /api/play/worker — the CF worker is just the alarm clock, everything
 * lives here.
 *
 * Provider frugality (TRD §2.4): API-Football is only called
 *   - every tick while a matchday window is active
 *     (lock_at ≤ now ≤ last kickoff + 4h, or fixtures still reconciling), and
 *   - once per 15 minutes for a fixture refresh while a round is upcoming.
 * Outside those windows a tick is a cheap DB-only pass.
 */

let tickRunning = false;

export async function runWorkerTick(options?: { force?: boolean }): Promise<WorkerReport> {
  const force = options?.force ?? false;
  const nowDate = new Date();
  const now = nowDate.getTime();
  const nowIso = nowDate.toISOString();
  const minute = nowDate.getUTCMinutes();

  const report: WorkerReport = {
    ran_at: nowIso,
    live_window_active: false,
    fixtures_refreshed: false,
    transitions: [],
    kickoff_stamps: 0,
    stats_synced: 0,
    fixtures_finalized: 0,
    scores_recomputed: 0,
    rolled_over_to: null,
    notifications: "skipped",
    provider_rate_limit: getProviderRateLimit(),
    alerts: [],
  };

  // Best-effort overlap guard (per Node process).
  if (tickRunning) {
    report.alerts.push("previous tick still running — skipped");
    return report;
  }
  tickRunning = true;
  let workerLockToken: string | null = null;

  try {
    workerLockToken = await tryAcquireWorkerRun();
    if (!workerLockToken) {
      report.alerts.push("another worker tick in flight — skipped");
      return report;
    }

    const settings = await getFantasySettings();
    let matchdays = await loadMatchdays(settings);
    if (matchdays.length === 0) {
      report.alerts.push("no matchdays seeded — run scripts/seed-fantasy.ts");
      return report;
    }
    let fixtures = await loadFixtures(settings);
    checkFrozenDeadlinePostponements(matchdays, fixtures, now, report.alerts);

    // 1. Clock-based transition: upcoming → live once lock_at passes.
    for (const md of matchdays) {
      if (md.status === "upcoming" && now >= new Date(md.lock_at).getTime()) {
        await setMatchdayStatus(md.id, "live");
        md.status = "live";
        report.transitions.push(`MD${md.id}: upcoming→live`);
      }
    }

    // 2. Fixture refresh (provider-frugal) — or local timelapse clock-advance.
    const anyActive = matchdays.some((md) => isWindowActive(md, fixtures, now));
    report.live_window_active = anyActive;
    const anyUpcoming = matchdays.some((md) => md.status === "upcoming");
    const refreshDue =
      force || anyActive || (anyUpcoming && minute % FIXTURE_REFRESH_MINUTES === 0);

    if (LOCAL_TIMELAPSE) {
      try {
        const advanced = await advanceTimelapseFixtures(fixtures, now);
        if (advanced > 0 || force) {
          report.fixtures_refreshed = true;
          report.transitions.push(`timelapse: advanced ${advanced} fixture(s)`);
          fixtures = await loadFixtures(settings);
        }
      } catch (error) {
        report.alerts.push(`timelapse fixture advance failed: ${String(error)}`);
      }
    } else if (refreshDue) {
      try {
        await refreshFixturesFromProvider(matchdays, nowIso, report.alerts);
        report.fixtures_refreshed = true;
        fixtures = await loadFixtures(settings);
        checkFrozenDeadlinePostponements(matchdays, fixtures, now, report.alerts);
      } catch (error) {
        report.alerts.push(`fixture refresh failed: ${String(error)}`);
      }
    }

    // 3. Per-fixture stats sync + reconciliation.
    const dueFixtures = fixtures
      .map((f) => ({ fixture: f, pass: statsSyncDue(f, now) }))
      .filter((d): d is { fixture: FixtureRow; pass: StatsPass } => d.pass !== null);
    const statsSyncedMatchdays = new Set<number>();
    if (dueFixtures.length > 0) {
      const playersMap = await getPlayersMap();
      const positions = new Map(
        [...playersMap.entries()].map(([id, p]) => [id, p.position] as const),
      );
      for (const { fixture, pass } of dueFixtures) {
        try {
          if (LOCAL_TIMELAPSE && isTimelapseFixtureId(fixture.provider_fixture_id)) {
            await syncTimelapseFixtureStats(fixture, pass, settings, nowIso);
          } else {
            await syncFixtureStats(fixture, pass, settings, positions, nowIso);
          }
          report.stats_synced++;
          statsSyncedMatchdays.add(fixture.matchday_id);
          if (pass === "reconcile_final") report.fixtures_finalized++;
        } catch (error) {
          report.alerts.push(
            `stats sync failed for fixture ${fixture.provider_fixture_id} (${pass}): ${String(error)}`,
          );
        }
      }
      fixtures = await loadFixtures(settings);
    }

    // Kickoff XI stamps retired for EPL (single deadline + auto-subs).
    const stampedMatchdays = new Set<number>();

    // 4. Status-based transitions from fresh fixture state.
    const finalizedThisTick: MatchdayRow[] = [];
    for (const md of matchdays) {
      const mdFixtures = fixtures.filter((f) => f.matchday_id === md.id);
      if (mdFixtures.length === 0) continue;

      if (md.status === "live" && mdFixtures.every((f) => FINISHED_STATUSES.has(f.status))) {
        await setMatchdayStatus(md.id, "finalizing");
        md.status = "finalizing";
        report.transitions.push(`MD${md.id}: live→finalizing`);
        try {
          await rolloverMatchday(md, matchdays, settings, report.alerts);
          report.rolled_over_to = nextMatchday(matchdays, md.id)?.id ?? null;
        } catch (error) {
          report.alerts.push(`rollover after MD${md.id} failed: ${String(error)}`);
        }
      }

      if (md.status === "finalizing" && mdFixtures.every((f) => f.stats_finalized)) {
        await setMatchdayStatus(md.id, "final");
        md.status = "final";
        finalizedThisTick.push(md);
        report.transitions.push(`MD${md.id}: finalizing→final`);
      }
    }

    // 5. Scores + ranks whenever stats or statuses moved. Matchdays whose
    // fixtures just synced are always included — even while 'upcoming'
    // (possible when a round was seeded mid-play, e.g. R16 test mode; in a
    // normal campaign an upcoming round has no stats, so this is a no-op).
    // pending_rescore_matchdays is a one-shot queue for migrations that
    // rewrite kickoff stamps directly (the amnesty backfill): those writes
    // bypass the stamp RPC, and final rounds are skipped by the stamp loop
    // above, so they'd otherwise never be rescored.
    const pendingRescore = (settings.pending_rescore_matchdays ?? []).map(Number);
    const scoreTargets = [
      ...new Set([
        ...matchdays
          .filter(
            (md) =>
              md.status === "live" ||
              md.status === "finalizing" ||
              finalizedThisTick.some((f) => f.id === md.id),
          )
          .map((md) => md.id),
        ...statsSyncedMatchdays,
        ...stampedMatchdays,
        ...pendingRescore,
        // Forced ticks always recompute the current round (manual ops).
        ...(force
          ? matchdays.filter((md) => md.status !== "final").slice(0, 1).map((md) => md.id)
          : []),
      ]),
    ];
    let recomputeSucceeded = true;
    if (
      report.stats_synced > 0 ||
      report.transitions.length > 0 ||
      stampedMatchdays.size > 0 ||
      pendingRescore.length > 0 ||
      force
    ) {
      try {
        report.scores_recomputed = await recomputeScores(scoreTargets, report.alerts);
        if (pendingRescore.length > 0) await clearPendingRescore(report.alerts);
      } catch (error) {
        recomputeSucceeded = false;
        report.alerts.push(`score recompute failed: ${String(error)}`);
      }
    }

    // 5b. Resolve GW challenges only after scores recompute succeeded.
    if (recomputeSucceeded) {
      for (const md of finalizedThisTick) {
        try {
          const n = await resolveChallengesForGameweek(md.id, report.alerts);
          if (n > 0) report.transitions.push(`MD${md.id}: resolved ${n} challenge(s)`);
        } catch (error) {
          report.alerts.push(`challenge resolve after MD${md.id} failed: ${String(error)}`);
        }
      }
    } else {
      for (const md of finalizedThisTick) {
        report.alerts.push(
          `challenge resolve deferred for MD${md.id}: score recompute failed`,
        );
      }
    }

    // 6. Emails (feature-gated).
    if (settings.features.emails && isEmailConfigured()) {
      try {
        report.notifications = await sendNotifications(
          settings,
          matchdays,
          finalizedThisTick,
          now,
          report.alerts,
        );
      } catch (error) {
        report.alerts.push(`notifications failed: ${String(error)}`);
      }
    }

    report.provider_rate_limit = getProviderRateLimit();
    const { remaining } = report.provider_rate_limit;
    if (remaining !== null && remaining < 20) {
      report.alerts.push(`provider rate limit low: ${remaining} calls remaining today`);
    }

    return report;
  } finally {
    if (workerLockToken) {
      try {
        await releaseWorkerRun(workerLockToken);
      } catch (error) {
        console.error("[play worker] failed to release worker lock:", error);
      }
    }
    tickRunning = false;
  }
}
