/**
 * Worker telemetry: WorkerReport → flattened `@worker.*` Datadog facets, and
 * the intake gating in datadog.server.ts.
 */
import { logToDatadog } from "@/app/lib/datadog.server";
import {
  WORKER_FAILURE_MESSAGE,
  WORKER_TICK_MESSAGE,
  buildWorkerFailureLog,
  buildWorkerTickLog,
} from "@/app/lib/fantasy/telemetry";
import type { WorkerReport } from "@/app/lib/fantasy/types";

const baseReport = (over: Partial<WorkerReport> = {}): WorkerReport => ({
  ran_at: "2026-08-14T12:00:00.000Z",
  live_window_active: false,
  fixtures_refreshed: false,
  transitions: [],
  kickoff_stamps: 0,
  stats_synced: 0,
  fixtures_finalized: 0,
  scores_recomputed: 0,
  rolled_over_to: null,
  notifications: "skipped",
  provider_rate_limit: { remaining: null, limit: null },
  alerts: [],
  ...over,
});

const workerAttrs = (log: { attributes: Record<string, unknown> }) =>
  log.attributes.worker as Record<string, unknown>;

describe("buildWorkerTickLog", () => {
  it("flattens a quiet tick as info", () => {
    const log = buildWorkerTickLog(baseReport(), 120);

    expect(log.message).toBe(WORKER_TICK_MESSAGE);
    expect(log.status).toBe("info");
    expect(log.attributes.feature).toBe("play");
    expect(workerAttrs(log)).toMatchObject({
      ok: true,
      duration_ms: 120,
      forced: false,
      alerts_count: 0,
      did_rollover: false,
      notifications_skipped: true,
      notifications_sent: 0,
    });
  });

  it("marks a tick carrying alerts as warn even though it returned 200", () => {
    const log = buildWorkerTickLog(
      baseReport({ alerts: ["rollover after MD3 failed: boom"] }),
      500,
    );

    expect(log.status).toBe("warn");
    expect(workerAttrs(log).alerts_count).toBe(1);
    expect(workerAttrs(log).alerts).toEqual(["rollover after MD3 failed: boom"]);
  });

  it("carries the numbers the dashboard graphs", () => {
    const log = buildWorkerTickLog(
      baseReport({
        live_window_active: true,
        fixtures_refreshed: true,
        kickoff_stamps: 11,
        stats_synced: 4,
        fixtures_finalized: 2,
        scores_recomputed: 812,
        rolled_over_to: 5,
        notifications: { sent: 37 },
        provider_rate_limit: { remaining: 143, limit: 7500 },
        transitions: ["MD4: live→finalizing"],
      }),
      2_400,
      { forced: true },
    );

    expect(workerAttrs(log)).toMatchObject({
      live_window_active: true,
      fixtures_refreshed: true,
      kickoff_stamps: 11,
      stats_synced: 4,
      fixtures_finalized: 2,
      scores_recomputed: 812,
      rolled_over_to: 5,
      did_rollover: true,
      notifications_skipped: false,
      notifications_sent: 37,
      provider_remaining: 143,
      provider_limit: 7500,
      transitions_count: 1,
      forced: true,
    });
  });

  it("caps runaway alert lists so one bad tick can't ship a huge payload", () => {
    const log = buildWorkerTickLog(
      baseReport({ alerts: Array.from({ length: 60 }, () => "x".repeat(1000)) }),
      10,
    );

    // Count stays truthful; only the shipped sample is trimmed.
    expect(workerAttrs(log).alerts_count).toBe(60);
    expect(workerAttrs(log).alerts).toHaveLength(25);
    expect((workerAttrs(log).alerts as string[])[0]).toHaveLength(301);
  });
});

describe("buildWorkerFailureLog", () => {
  it("shares the worker namespace so heartbeat queries count crashed ticks", () => {
    const log = buildWorkerFailureLog(new TypeError("provider exploded"), 90, {
      forced: true,
    });

    expect(log.message).toBe(WORKER_FAILURE_MESSAGE);
    expect(log.status).toBe("error");
    expect(workerAttrs(log)).toMatchObject({
      ok: false,
      duration_ms: 90,
      forced: true,
      alerts_count: 1,
    });
    expect(log.attributes.error).toMatchObject({
      kind: "TypeError",
      message: "provider exploded",
    });
  });

  it("normalizes non-Error throws", () => {
    const log = buildWorkerFailureLog("string failure", 5);

    expect(log.attributes.error).toMatchObject({
      kind: "Error",
      message: "string failure",
    });
  });
});

describe("logToDatadog", () => {
  const OLD_ENV = process.env;
  // The suite runs under jsdom, but this module is server-only and refuses to
  // send when a window exists (same guard as getServerMixpanelToken). Hide the
  // jsdom window so these tests exercise the real server path.
  const OLD_WINDOW = global.window;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    // @ts-expect-error — deliberately simulating a server runtime.
    delete global.window;
    (global.fetch as jest.Mock).mockReset();
  });

  afterEach(() => {
    global.window = OLD_WINDOW;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it("refuses to send from a browser runtime", async () => {
    process.env.DD_API_KEY = "dd-test-key";
    global.window = OLD_WINDOW;

    await expect(logToDatadog("hello")).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("no-ops without an API key rather than throwing", async () => {
    delete process.env.DD_API_KEY;

    await expect(logToDatadog("hello")).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts to the configured site's intake with the API key header", async () => {
    process.env.DD_API_KEY = "dd-test-key";
    process.env.NEXT_PUBLIC_DD_SITE = "datadoghq.eu";
    process.env.NEXT_PUBLIC_DD_ENV = "production";
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    await expect(
      logToDatadog("play worker tick", { worker: { ok: true } }, "info"),
    ).resolves.toBe(true);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("https://http-intake.logs.datadoghq.eu/api/v2/logs");
    expect(init.headers["DD-API-KEY"]).toBe("dd-test-key");

    const [payload] = JSON.parse(init.body);
    expect(payload).toMatchObject({
      message: "play worker tick",
      status: "info",
      ddtags: "env:production",
      worker: { ok: true },
    });
  });

  it("swallows intake failures so telemetry can't break a tick", async () => {
    process.env.DD_API_KEY = "dd-test-key";
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

    await expect(logToDatadog("play worker tick")).resolves.toBe(false);
  });
});
