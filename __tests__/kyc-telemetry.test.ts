/**
 * KYC telemetry: step outcomes → flattened `@kyc.*` Datadog facets, the PII
 * masking that guards them, and emission through the shared pino logger.
 */
// Relative specifier: jest's moduleNameMapper rewrites "@/x" to "<rootDir>/app/x",
// which cannot resolve the "@/app/..." form that jest.mock needs to match.
// The mock is built inside the factory because jest hoists this call above any
// const declared above it.
jest.mock("../app/lib/logger", () => {
  const mock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return { __esModule: true, default: mock, logger: mock };
});

// dd-trace is patched into the process at boot in production; here it only
// needs to hand back a span whose tags the assertions can read.
const addTags = jest.fn();
const activeSpan: { addTags: jest.Mock } | null = { addTags };
jest.mock("dd-trace", () => ({
  __esModule: true,
  default: {
    scope: () => ({ active: () => (activeSpan as unknown) }),
  },
}));

import loggerModule from "../app/lib/logger";

const mockLogger = loggerModule as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

import {
  KYC_EVENT_MESSAGE,
  buildKycLog,
  createKycReporter,
  emitKycEvent,
  sanitizeDetail,
} from "@/app/lib/kyc-telemetry";

const kycAttrs = (log: { attributes: Record<string, unknown> }) =>
  log.attributes.kyc as Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("buildKycLog", () => {
  it("flattens a successful tier 2 upgrade as info", () => {
    const log = buildKycLog({
      step: "id_verification",
      outcome: "success",
      walletAddress: "0xAbCdEf",
      tierFrom: 1,
      tierTo: 2,
      jobId: "job-1",
      durationMs: 940,
    });

    expect(log.message).toBe(KYC_EVENT_MESSAGE);
    expect(log.status).toBe("info");
    expect(log.attributes.feature).toBe("kyc");
    expect(kycAttrs(log)).toMatchObject({
      step: "id_verification",
      outcome: "success",
      ok: true,
      promoted: true,
      tier_from: 1,
      tier_to: 2,
      duration_ms: 940,
    });
  });

  it("lower-cases the wallet address so a search matches any casing", () => {
    const log = buildKycLog({
      step: "id_verification",
      outcome: "success",
      walletAddress: "0xAbCdEf0123",
    });

    expect(kycAttrs(log).wallet_address).toBe("0xabcdef0123");
  });

  it("carries the provider's own rejection text at warn", () => {
    const log = buildKycLog({
      step: "id_verification",
      outcome: "rejected",
      reason: "provider_rejected",
      detail: "Selfie does not match ID photo",
      failureCategory: "mismatch",
      providerCode: 1012,
      attempt: 2,
      attemptsRemaining: 1,
    });

    expect(log.status).toBe("warn");
    expect(kycAttrs(log)).toMatchObject({
      outcome: "rejected",
      ok: false,
      reason: "provider_rejected",
      detail: "Selfie does not match ID photo",
      failure_category: "mismatch",
      // Stringified so the facet has one type whatever the provider returns.
      provider_code: "1012",
      attempt: 2,
      attempts_remaining: 1,
    });
  });

  it("logs an infrastructure failure at error with error.* for Error Tracking", () => {
    const log = buildKycLog({
      step: "address_verification",
      outcome: "error",
      reason: "provider_request_failed",
      error: new TypeError("fetch failed"),
    });

    expect(log.status).toBe("error");
    expect(log.attributes.error).toMatchObject({
      kind: "TypeError",
      message: "fetch failed",
    });
  });

  it("masks the stack too — its first line repeats the message", () => {
    const error = new Error("ID 12345678901 could not be verified");
    const log = buildKycLog({
      step: "id_verification",
      outcome: "error",
      error,
    });

    const shipped = log.attributes.error as { message: string; stack: string };
    expect(shipped.message).toBe("ID [digits] could not be verified");
    expect(shipped.stack).toContain("ID [digits] could not be verified");
    expect(shipped.stack).not.toContain("12345678901");
  });

  it("logs a no-op callback at info without claiming a promotion", () => {
    const log = buildKycLog({
      step: "id_callback",
      outcome: "noop",
      reason: "already_verified",
    });

    expect(log.status).toBe("info");
    expect(kycAttrs(log).ok).toBe(false);
  });

  it("drops empty facets rather than shipping nulls", () => {
    const log = buildKycLog({
      step: "status",
      outcome: "error",
      detail: null,
      jobId: "",
      tierFrom: undefined,
    });

    const attrs = kycAttrs(log);
    expect(attrs).not.toHaveProperty("detail");
    expect(attrs).not.toHaveProperty("job_id");
    expect(attrs).not.toHaveProperty("tier_from");
    // A real zero still has to survive.
    expect(kycAttrs(buildKycLog({ step: "status", outcome: "error", tierFrom: 0 })).tier_from).toBe(0);
  });

  it("omits `promoted` when only one side of the tier change is known", () => {
    const log = buildKycLog({
      step: "phone_otp_verify",
      outcome: "rejected",
      tierFrom: 0,
    });

    expect(kycAttrs(log)).not.toHaveProperty("promoted");
  });
});

describe("sanitizeDetail", () => {
  // Smile ID and Dojah quote the input that failed, so a rejection message can
  // arrive carrying the very ID number we must never log.
  it("masks ID-number-length digit runs", () => {
    expect(sanitizeDetail("ID 12345678901 could not be verified")).toBe(
      "ID [digits] could not be verified",
    );
  });

  it("leaves short numbers — result codes, tiers — readable", () => {
    expect(sanitizeDetail("ResultCode 1012 on tier 2")).toBe(
      "ResultCode 1012 on tier 2",
    );
  });

  it("masks email addresses", () => {
    expect(sanitizeDetail("no record for user@example.com")).toBe(
      "no record for [email]",
    );
  });

  it("truncates a pathological message", () => {
    const masked = sanitizeDetail("x".repeat(900));
    expect(masked).toHaveLength(501);
    expect(masked.endsWith("…")).toBe(true);
  });
});

describe("emitKycEvent", () => {
  it("routes each outcome to the matching pino level", () => {
    emitKycEvent({ step: "phone_otp_send", outcome: "success" });
    emitKycEvent({ step: "phone_otp_send", outcome: "rejected" });
    emitKycEvent({ step: "phone_otp_send", outcome: "error" });

    expect(mockLogger.info).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "kyc" }),
      KYC_EVENT_MESSAGE,
    );
  });

  it("mirrors the identifying facets onto the active APM span", () => {
    emitKycEvent({
      step: "id_verification",
      outcome: "rejected",
      reason: "provider_rejected",
      stage: "provider_verify",
      targetTier: 2,
    });

    expect(addTags).toHaveBeenCalledWith({
      "kyc.step": "id_verification",
      "kyc.outcome": "rejected",
      "kyc.reason": "provider_rejected",
      "kyc.stage": "provider_verify",
      "kyc.target_tier": 2,
    });
  });

  it("never throws, whatever the caller passes", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() =>
      emitKycEvent({
        step: "id_verification",
        outcome: "error",
        error: circular,
      }),
    ).not.toThrow();
  });
});

describe("createKycReporter", () => {
  it("binds base facets and stamps a duration on every exit", () => {
    const report = createKycReporter({
      step: "id_verification",
      walletAddress: "0xabc",
      targetTier: 2,
      provider: "smile_id",
    });

    report.rejected({ reason: "attempts_exhausted", statusCode: 429 });

    const [attributes] = mockLogger.warn.mock.calls[0];
    expect(attributes.kyc).toMatchObject({
      step: "id_verification",
      wallet_address: "0xabc",
      target_tier: 2,
      provider: "smile_id",
      reason: "attempts_exhausted",
      status_code: 429,
    });
    expect(typeof attributes.kyc.duration_ms).toBe("number");
  });

  it("lets a call override a base facet — the callback learns its wallet late", () => {
    const report = createKycReporter({ step: "id_callback", targetTier: 2 });

    report.success({ walletAddress: "0xlate", tierFrom: 1, tierTo: 2 });

    const [attributes] = mockLogger.info.mock.calls[0];
    expect(attributes.kyc.wallet_address).toBe("0xlate");
  });
});
