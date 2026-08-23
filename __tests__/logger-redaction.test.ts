/// <reference types="jest" />

/**
 * Logger redaction. fast-redact has no recursive wildcard and "*.token" only
 * matches one level down, so root-level secrets need their own bare paths —
 * the failure mode is silent, and root-level is the shape most call sites use.
 */
import { Writable } from "stream";

import pino from "pino";

/** Captures what the logger actually writes, rather than trusting config. */
function captureLine(build: (dest: Writable) => pino.Logger): (obj: object) => Record<string, unknown> {
  return (obj: object) => {
    let written = "";
    const dest = new Writable({
      write(chunk, _enc, cb) {
        written += chunk.toString();
        cb();
      },
    });
    build(dest).info(obj, "test");
    return JSON.parse(written);
  };
}

// Mirrors the redact block in app/lib/logger.ts. Kept in sync deliberately:
// importing the real logger would bind it to a live stdout stream.
const REDACT_PATHS = [
  "authorization",
  "cookie",
  "password",
  "token",
  "secret",
  "apiKey",
  "api_key",
  "*.authorization",
  "*.cookie",
  "*.password",
  "*.token",
  "*.secret",
  "*.apiKey",
  "*.api_key",
  "req.headers.authorization",
  "req.headers.cookie",
];

const log = captureLine((dest) =>
  pino({ redact: { paths: REDACT_PATHS, censor: "[redacted]" } }, dest),
);

describe("logger redaction", () => {
  it("redacts root-level secrets", () => {
    const line = log({
      token: "super-secret",
      password: "hunter2",
      authorization: "Bearer abc",
      apiKey: "k-1",
      api_key: "k-2",
      cookie: "session=1",
      secret: "s",
    });

    for (const key of [
      "token",
      "password",
      "authorization",
      "apiKey",
      "api_key",
      "cookie",
      "secret",
    ]) {
      expect(line[key]).toBe("[redacted]");
    }
  });

  it("still redacts one level down", () => {
    const line = log({ ctx: { token: "nested-secret" } });

    expect((line.ctx as Record<string, unknown>).token).toBe("[redacted]");
  });

  it("redacts request headers", () => {
    const line = log({ req: { headers: { authorization: "Bearer abc" } } });

    const headers = (line.req as { headers: Record<string, unknown> }).headers;
    expect(headers.authorization).toBe("[redacted]");
  });

  it("leaves ordinary fields alone", () => {
    const line = log({ feature: "play", matchday_id: 12 });

    expect(line.feature).toBe("play");
    expect(line.matchday_id).toBe(12);
  });
});
