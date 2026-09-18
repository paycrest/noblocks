/**
 * Datadog telemetry for the KYC flow (tiers 1–3).
 *
 * Until this existed, a failed tier upgrade left no queryable trace. Client
 * errors went to GlitchTip, Mixpanel only ever heard about submissions and
 * successes, and the routes themselves reported failures through `console.*` —
 * unparsed strings with no trace correlation, and in the case of a genuine
 * Smile ID rejection, nothing at all. "Why did this user's upgrade fail?" was
 * not answerable from Datadog.
 *
 * One structured line per KYC step outcome, flattened into `@kyc.*` facets so
 * Datadog can turn them into metrics (Logs → Generate Metrics) and monitors,
 * and so support can search a wallet address and read the provider's own words
 * for why it failed.
 *
 * Emitted through the shared pino logger to stdout, where the agent sidecar
 * collects it. `logger` stamps dd.trace_id, so each line links back to its
 * trace; the same facets are mirrored onto the active span so the failures are
 * filterable from APM too.
 *
 * Server-only — `logger` pulls in Node internals.
 */
import tracer from "dd-trace";

import logger from "@/app/lib/logger";

type DatadogLogStatus = "info" | "warn" | "error";

/** Stable message string — log-based metrics and monitors filter on this. */
export const KYC_EVENT_MESSAGE = "kyc step";

/**
 * The upgrade steps, plus the signup nudge that precedes tier 1 and the
 * read-only status endpoint (failures only — every KYC surface polls it, so
 * logging its successes would bury everything else).
 */
export type KycStep =
  | "signup_email"
  | "phone_otp_send"
  | "phone_otp_verify"
  | "id_verification"
  | "id_callback"
  | "address_verification"
  | "status";

/**
 * `rejected` is a legitimate user-facing outcome (wrong OTP, Smile ID said no,
 * attempts exhausted); `error` is our fault or a provider's. Separating them is
 * what keeps an outage monitor from being drowned by users mistyping an OTP.
 *
 * `noop` is for work that correctly did nothing — chiefly the async Smile ID
 * callback arriving after the synchronous path already promoted the profile.
 * It logs at info so callback delivery stays observable without a stream of
 * warnings about the normal case.
 */
export type KycOutcome = "success" | "rejected" | "error" | "noop";

export type KycProvider =
  | "smile_id"
  | "dojah"
  | "kudisms"
  | "twilio"
  | "supabase";

/**
 * Bounds on the payload. Provider and Postgres messages are built from the data
 * that caused them, so an unbounded `detail` is both a payload-size and an
 * accidental-disclosure risk.
 */
const MAX_DETAIL_LENGTH = 500;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_ERROR_STACK_LENGTH = 2_000;

/**
 * Provider rejection messages quote the input that failed — Smile ID and Dojah
 * both echo the submitted ID number back in `ResultText`. Mask long digit runs
 * (NIN and BVN are 11, passport and licence numbers are shorter but still
 * caught) and anything email-shaped before the line ships. Result codes
 * (4 digits) and tier numbers stay readable.
 */
const DIGIT_RUN = /\d{6,}/g;
const EMAIL_LIKE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function maskSensitive(value: string): string {
  return value.replace(EMAIL_LIKE, "[email]").replace(DIGIT_RUN, "[digits]");
}

/** Exported for the test suite — masking is the guard that keeps PII out. */
export function sanitizeDetail(value: string): string {
  return truncate(maskSensitive(value), MAX_DETAIL_LENGTH);
}

/** Facets are only useful when absent means absent — drop empty keys. */
function compact(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}

/** Everything a step can report beyond its identity and outcome. */
export interface KycEventDetails {
  /** Lower-cased before it ships, so a search matches whatever casing support pastes. */
  walletAddress?: string | null;
  /** Where in the route it happened: `profile_fetch`, `provider_submit`, … */
  stage?: string;
  /** Stable machine-readable cause: `attempts_exhausted`, `provider_rejected`, … */
  reason?: string;
  /** The provider's or Postgres' own message. Masked and truncated. */
  detail?: string | null;
  /** `classifySmileIdFailure` output, for the ID step. */
  failureCategory?: string | null;
  provider?: KycProvider;
  /** Smile ID ResultCode, Postgres SQLSTATE, Dojah status. */
  providerCode?: string | number | null;
  jobId?: string | null;
  jobType?: number | null;
  idCountry?: string | null;
  idType?: string | null;
  tierFrom?: number | null;
  tierTo?: number | null;
  /** The tier this step is trying to reach, even when it never gets there. */
  targetTier?: number | null;
  attempt?: number | null;
  attemptsRemaining?: number | null;
  durationMs?: number;
  statusCode?: number;
  /** Attached as `error.*` so Datadog Error Tracking groups it. */
  error?: unknown;
}

export interface KycEvent extends KycEventDetails {
  step: KycStep;
  outcome: KycOutcome;
}

export interface KycLog {
  message: string;
  status: DatadogLogStatus;
  attributes: Record<string, unknown>;
}

const STATUS_BY_OUTCOME: Record<KycOutcome, DatadogLogStatus> = {
  success: "info",
  noop: "info",
  rejected: "warn",
  error: "error",
};

/**
 * Flattens one step outcome. `@kyc.ok` is the boolean twin of `outcome` so a
 * single "upgrades in the last hour" query can count failures without an
 * outcome-by-outcome filter.
 */
export function buildKycLog(event: KycEvent): KycLog {
  const {
    step,
    outcome,
    walletAddress,
    stage,
    reason,
    detail,
    failureCategory,
    provider,
    providerCode,
    jobId,
    jobType,
    idCountry,
    idType,
    tierFrom,
    tierTo,
    targetTier,
    attempt,
    attemptsRemaining,
    durationMs,
    statusCode,
    error,
  } = event;

  const attributes: Record<string, unknown> = {
    feature: "kyc",
    kyc: compact({
      step,
      outcome,
      ok: outcome === "success",
      wallet_address: walletAddress ? walletAddress.toLowerCase() : undefined,
      stage,
      reason,
      detail: detail ? sanitizeDetail(detail) : undefined,
      failure_category: failureCategory,
      provider,
      provider_code:
        providerCode === undefined || providerCode === null
          ? undefined
          : String(providerCode),
      job_id: jobId,
      job_type: jobType,
      id_country: idCountry,
      id_type: idType,
      tier_from: tierFrom,
      tier_to: tierTo,
      target_tier: targetTier,
      // Boolean twin so a promotion is countable without a null-vs-0 filter.
      promoted:
        typeof tierFrom === "number" && typeof tierTo === "number"
          ? tierTo > tierFrom
          : undefined,
      attempt,
      attempts_remaining: attemptsRemaining,
      duration_ms: durationMs,
      status_code: statusCode,
    }),
  };

  if (error !== undefined) {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    attributes.error = compact({
      kind: normalized.name,
      message: sanitizeDetail(
        truncate(normalized.message, MAX_ERROR_MESSAGE_LENGTH),
      ),
      // Our own frames, and the main reason to ship an error line at all.
      // Masked on its own budget: the first line of a stack repeats the
      // message, so skipping it here would undo the masking above.
      stack: normalized.stack
        ? truncate(maskSensitive(normalized.stack), MAX_ERROR_STACK_LENGTH)
        : undefined,
    });
  }

  return {
    message: KYC_EVENT_MESSAGE,
    status: STATUS_BY_OUTCOME[outcome],
    attributes,
  };
}

/**
 * Mirrors the identifying facets onto the active APM span so the same failure
 * is findable from the trace view, not only from Logs.
 *
 * Deliberately does not set the span's error flag: dd-trace already marks 5xx
 * responses, and flagging a `rejected` outcome (a user mistyping an OTP) would
 * inflate the service's APM error rate with normal product behaviour.
 */
function tagActiveSpan(event: KycEvent): void {
  try {
    const span = tracer.scope().active();
    if (!span) return;
    span.addTags(
      compact({
        "kyc.step": event.step,
        "kyc.outcome": event.outcome,
        "kyc.reason": event.reason,
        "kyc.stage": event.stage,
        "kyc.target_tier": event.targetTier,
      }),
    );
  } catch {
    // APM disabled or unavailable — the log line still stands on its own.
  }
}

/**
 * Writes a step outcome to stdout for the agent to collect.
 *
 * Synchronous and non-throwing by contract: pino writes to a stream rather than
 * making a network call, so there is nothing to await and no in-flight request
 * for the runtime to drop. Telemetry must never be the reason a verification
 * fails, so the whole body is guarded.
 */
export function emitKycEvent(event: KycEvent): void {
  try {
    tagActiveSpan(event);
    const log = buildKycLog(event);
    logger[log.status](log.attributes, log.message);
  } catch {
    // Never let reporting break the flow it is reporting on.
  }
}

export interface KycReporter {
  /** The step completed and the user is now at `tierTo`. */
  success(details?: KycEventDetails): void;
  /** A legitimate user-facing refusal — the flow worked, the answer was no. */
  rejected(details: KycEventDetails): void;
  /** Our fault, the database's, or the provider's. */
  failed(details: KycEventDetails): void;
  /** Correctly did nothing — already verified, superseded, not applicable. */
  noop(details: KycEventDetails): void;
}

/**
 * Binds the facets a route already knows (step, wallet, target tier, provider)
 * and stamps `duration_ms` from construction, so each exit path is one call
 * naming only what is new about it.
 *
 * Construct it as early as the wallet address is known; later calls can still
 * override any base field — the async Smile ID callback, for one, only learns
 * the wallet from the request body.
 */
export function createKycReporter(
  base: KycEventDetails & { step: KycStep },
): KycReporter {
  const startedAt = Date.now();

  const emit = (outcome: KycOutcome, details: KycEventDetails = {}) =>
    emitKycEvent({
      ...base,
      ...details,
      step: base.step,
      outcome,
      durationMs: details.durationMs ?? Date.now() - startedAt,
    });

  return {
    success: (details) => emit("success", details),
    rejected: (details) => emit("rejected", details),
    failed: (details) => emit("error", details),
    noop: (details) => emit("noop", details),
  };
}
