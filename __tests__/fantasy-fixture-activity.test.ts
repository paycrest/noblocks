import {
  FIXTURE_FINISHED_STATUSES,
  FIXTURE_LIVE_STATUSES,
  hasActiveFixtures,
  playPollIntervalMs,
} from "@/app/lib/fantasy/fixture-activity";

describe("hasActiveFixtures", () => {
  const kickoff = "2026-08-15T15:00:00.000Z";

  it("is true when a fixture is in a live provider status", () => {
    expect(hasActiveFixtures([{ status: "2H", kickoff }], Date.parse(kickoff))).toBe(true);
  });

  it("is false when all fixtures finished", () => {
    expect(
      hasActiveFixtures(
        [
          { status: "FT", kickoff },
          { status: "FT", kickoff },
        ],
        Date.parse(kickoff) + 7200_000,
      ),
    ).toBe(false);
  });

  it("is false before kickoff with NS status", () => {
    expect(hasActiveFixtures([{ status: "NS", kickoff }], Date.parse(kickoff) - 60_000)).toBe(
      false,
    );
  });

  it("is true after kickoff while provider status is still NS", () => {
    expect(hasActiveFixtures([{ status: "NS", kickoff }], Date.parse(kickoff) + 60_000)).toBe(
      true,
    );
  });

  it("is false for terminal postponed/cancelled statuses", () => {
    expect(hasActiveFixtures([{ status: "PST", kickoff }], Date.parse(kickoff))).toBe(false);
    expect(hasActiveFixtures([{ status: "CANC", kickoff }], Date.parse(kickoff))).toBe(false);
  });

  it("is false for NS long after kickoff", () => {
    expect(
      hasActiveFixtures([{ status: "NS", kickoff }], Date.parse(kickoff) + 5 * 60 * 60 * 1000),
    ).toBe(false);
  });
});

describe("playPollIntervalMs", () => {
  it("returns 15s only while fixtures are active", () => {
    expect(
      playPollIntervalMs("live", [{ status: "1H", kickoff: new Date().toISOString() }]),
    ).toBe(15_000);
    expect(playPollIntervalMs("live", [{ status: "NS", kickoff: new Date(Date.now() + 86_400_000).toISOString() }])).toBe(
      false,
    );
  });

  it("returns 60s while finalizing with no live fixtures", () => {
    expect(
      playPollIntervalMs("finalizing", [{ status: "FT", kickoff: new Date().toISOString() }]),
    ).toBe(60_000);
  });

  it("returns false between gameweeks", () => {
    expect(playPollIntervalMs("upcoming", [])).toBe(false);
    expect(playPollIntervalMs("final", [])).toBe(false);
  });
});

describe("status sets", () => {
  it("includes SUSP in live set for client display parity", () => {
    expect(FIXTURE_LIVE_STATUSES.has("SUSP")).toBe(true);
    expect(FIXTURE_FINISHED_STATUSES.has("FT")).toBe(true);
  });
});
