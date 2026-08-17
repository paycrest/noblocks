/**
 * Worker telemetry: WorkerReport → flattened `@worker.*` Datadog facets, and
 * emission through the shared pino logger.
 */
// Relative specifier: jest's moduleNameMapper rewrites "@/x" to "<rootDir>/app/x",
// which cannot resolve the "@/app/..." form that jest.mock needs to match.
// The mock is built inside the factory because jest hoists this call above any
// const declared above it.
jest.mock("../app/lib/logger", () => {
  const mock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { __esModule: true, default: mock, logger: mock };
});

import loggerModule from "../app/lib/logger";

const mockLogger = loggerModule as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

import {
  WORKER_FAILURE_MESSAGE,
  WORKER_TICK_MESSAGE,
  buildWorkerFailureLog,
  buildWorkerTickLog,
  emitWorkerTickLog,
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

  it("bounds the message and stack before shipping them", () => {
    // Postgres and provider errors can build their message from the data that
    // caused them, so an unbounded message risks both payload size and
    // accidental disclosure.
    const error = new Error("x".repeat(5_000));
    error.stack = `Error: boom\n${"    at frame\n".repeat(1_000)}`;

    const payload = buildWorkerFailureLog(error, 5).attributes.error as {
      message: string;
      stack: string;
    };

    expect(payload.message).toHaveLength(501); // 500 + ellipsis
    expect(payload.stack).toHaveLength(2_001);
    // Capped, not dropped — the frames are why the log is worth shipping.
    expect(payload.stack.startsWith("Error: boom")).toBe(true);
  });

  it("omits the stack entirely when the error has none", () => {
    const error = new Error("no stack here");
    delete error.stack;

    expect(
      (buildWorkerFailureLog(error, 5).attributes.error as { stack?: string })
        .stack,
    ).toBeUndefined();
  });
});

describe("emitWorkerTickLog", () => {
  beforeEach(() => {
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.error.mockReset();
  });

  it("writes a quiet tick at info, attributes first", () => {
    emitWorkerTickLog(buildWorkerTickLog(baseReport(), 120));

    expect(mockLogger.warn).not.toHaveBeenCalled();
    // pino's signature is (mergingObject, message) — the facets must be the
    // first argument or they end up interpolated into the message string.
    const [attributes, message] = mockLogger.info.mock.calls[0];
    expect(message).toBe(WORKER_TICK_MESSAGE);
    expect(attributes).toMatchObject({
      feature: "play",
      worker: { ok: true, duration_ms: 120 },
    });
  });

  it("routes an alert-bearing tick to warn", () => {
    emitWorkerTickLog(
      buildWorkerTickLog(baseReport({ alerts: ["rollover failed"] }), 10),
    );

    expect(mockLogger.info).not.toHaveBeenCalled();
    expect(mockLogger.warn.mock.calls[0][1]).toBe(WORKER_TICK_MESSAGE);
  });

  it("routes a crashed tick to error", () => {
    emitWorkerTickLog(buildWorkerFailureLog(new Error("boom"), 10));

    expect(mockLogger.error.mock.calls[0][1]).toBe(WORKER_FAILURE_MESSAGE);
    expect(mockLogger.error.mock.calls[0][0]).toMatchObject({
      worker: { ok: false },
    });
  });
});
