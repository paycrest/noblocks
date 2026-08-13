/**
 * Fixture activity helpers — isomorphic (client polling + server squad payload).
 * A gameweek can be "live" for days while no match is on the pitch; only poll
 * fast while at least one fixture is in play or post-kickoff awaiting status.
 */

export const FIXTURE_LIVE_STATUSES = new Set([
  "1H",
  "HT",
  "2H",
  "ET",
  "BT",
  "P",
  "LIVE",
  "INT",
  "SUSP",
]);

export const FIXTURE_FINISHED_STATUSES = new Set([
  "FT",
  "AET",
  "PEN",
  "AWD",
  "WO",
]);

export interface FixtureKickoffStatus {
  status: string;
  kickoff: string;
}

export function hasActiveFixtures(
  fixtures: FixtureKickoffStatus[],
  nowMs = Date.now(),
): boolean {
  return fixtures.some((f) => {
    if (FIXTURE_LIVE_STATUSES.has(f.status)) return true;
    if (FIXTURE_FINISHED_STATUSES.has(f.status)) return false;
    const kickedOff = nowMs >= new Date(f.kickoff).getTime();
    if (!kickedOff || f.status === "TBD") return false;
    // Kickoff passed but provider still NS — match getTeamLockStates fail-safe.
    return true;
  });
}

/** React-query refetch cadence: 15s only while fixtures are active; 60s while finalizing. */
export function playPollIntervalMs(
  matchdayStatus: string | undefined,
  fixtures: FixtureKickoffStatus[] | undefined,
): number | false {
  if (hasActiveFixtures(fixtures ?? [])) return 15_000;
  if (matchdayStatus === "finalizing") return 60_000;
  return false;
}
