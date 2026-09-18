import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import {
  submitSmileIDJob,
  SmileIdValidationError,
  getJobTypeForIdType,
  type SmileIDIdInfo,
} from "@/app/lib/smileID";

import idTypesData from "./id_types.json";

import { rateLimit } from "@/app/lib/rate-limit";
import { notifyKycResultEmail } from "@/app/lib/activepieces-kyc-result";
import { createKycReporter, emitKycEvent } from "@/app/lib/kyc-telemetry";

/**
 * Country|ID-type pairs the app actually offers. The KYC modal builds its
 * dropdown from the same catalogue, so any other pair reaching this route is a
 * stale or hand-crafted request for a product we have not enabled on Smile ID.
 */
const SUPPORTED_COUNTRY_ID_TYPES: ReadonlySet<string> = new Set(
  idTypesData.continents.flatMap((continent) =>
    continent.countries.flatMap((country) =>
      country.id_types.map((idType) => `${country.code}|${idType.type}`),
    ),
  ),
);

function isSupportedCountryIdType(country: string, idType: string): boolean {
  const key = `${country.trim().toUpperCase()}|${idType.trim().toUpperCase()}`;
  return SUPPORTED_COUNTRY_ID_TYPES.has(key);
}

type SmileFailureCategory = "database" | "quality" | "liveness" | "mismatch" | "general";

// Only matches clear infrastructure signals — NOT normal verification failures like
// "ID Not Verified" or "Unable to Verify" (which are meaningful SmileID outcomes).
function classifySmileIdFailure(resultText: string): SmileFailureCategory {
  const t = resultText.toLowerCase();
  if (
    t.includes("timeout") ||
    t.includes("database") ||
    t.includes("service unavailable") ||
    t.includes("internal server error") ||
    t.includes("server error") ||
    t.includes("temporarily unavailable") ||
    t.includes("connection")
  ) return "database";
  if (t.includes("readable") || t.includes("bright") || t.includes("blurry") || t.includes("quality") || t.includes("not clear")) return "quality";
  if (t.includes("liveness")) return "liveness";
  if (t.includes("mismatch") || t.includes("face")) return "mismatch";
  return "general";
}

export async function POST(request: NextRequest) {
  // Rate limit check
  const rateLimitResult = await rateLimit(request);
  if (!rateLimitResult.success) {
    emitKycEvent({
      step: "id_verification",
      outcome: "rejected",
      targetTier: 2,
      reason: "rate_limited",
      statusCode: 429,
    });
    return NextResponse.json(
      {
        status: "error",
        message: "Too many requests. Please try again later.",
      },
      { status: 429 },
    );
  }

  // Get the wallet address from the header set by the middleware
  const walletAddress = request.headers.get("x-wallet-address");

  if (!walletAddress) {
    // Not an unauthenticated user: middleware matches this route, turns those
    // away with its own 401, and strips forged wallet headers. Reaching the
    // handler without one means the matcher or header propagation broke.
    emitKycEvent({
      step: "id_verification",
      outcome: "error",
      targetTier: 2,
      reason: "unauthorized",
      statusCode: 401,
    });
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 },
    );
  }

  // Every exit below reports through this, so no verification outcome — least
  // of all a provider rejection — leaves the route without a Datadog line.
  const report = createKycReporter({
    step: "id_verification",
    walletAddress,
    targetTier: 2,
    provider: "smile_id",
  });

  try {
    const body = await request.json();
    const { images, partner_params, id_info, email } = body;

    // Validate required fields
    if (!images || !Array.isArray(images) || images.length === 0) {
      report.rejected({
        stage: "request_validation",
        reason: "invalid_images",
        statusCode: 400,
      });
      return NextResponse.json(
        { status: "error", message: "Invalid images data" },
        { status: 400 },
      );
    }

    // Validate id_info for Job Type 1 (Biometric KYC)
    if (!id_info?.country || !id_info?.id_type) {
      report.rejected({
        stage: "request_validation",
        reason: "missing_id_info",
        statusCode: 400,
      });
      return NextResponse.json(
        {
          status: "error",
          message: "Missing id_info: country and id_type are required",
        },
        { status: 400 },
      );
    }

    // Country|ID-type is known from here on: carried on every line so
    // "which ID types fail most" is a group-by rather than an investigation.
    const idContext = {
      idCountry: id_info.country,
      idType: id_info.id_type,
    };

    // Reject unsupported pairs before the attempt counter is incremented, so a
    // request Smile ID can never verify does not burn one of the user's tries.
    if (!isSupportedCountryIdType(id_info.country, id_info.id_type)) {
      report.rejected({
        ...idContext,
        stage: "request_validation",
        reason: "unsupported_id_type",
        statusCode: 400,
      });
      return NextResponse.json(
        {
          status: "error",
          message: "Unsupported ID type for the selected country.",
        },
        { status: 400 },
      );
    }

    // Fetch profile first — must exist before we count attempts
    const { data: existingProfile, error: profileFetchError } =
      await supabaseAdmin
        .from("user_kyc_profiles")
        .select("platform, tier, is_injected_wallet")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

    if (profileFetchError) {
      report.failed({
        ...idContext,
        stage: "profile_fetch",
        reason: "supabase_error",
        provider: "supabase",
        providerCode: profileFetchError.code,
        detail: profileFetchError.message,
        statusCode: 500,
      });
      return NextResponse.json(
        {
          status: "error",
          message: "Failed to load KYC profile",
        },
        { status: 500 },
      );
    }

    if (!existingProfile) {
      report.rejected({
        ...idContext,
        stage: "profile_fetch",
        reason: "no_kyc_profile",
        statusCode: 404,
      });
      return NextResponse.json(
        {
          status: "error",
          message:
            "No KYC profile exists. Please complete phone verification first.",
        },
        { status: 404 },
      );
    }

    if (existingProfile.tier < 1) {
      report.rejected({
        ...idContext,
        stage: "profile_fetch",
        reason: "phone_verification_required",
        tierFrom: Number(existingProfile.tier) || 0,
        statusCode: 403,
      });
      return NextResponse.json(
        {
          status: "error",
          message:
            "Phone verification required before ID verification.",
        },
        { status: 403 },
      );
    }

    const tierFrom = Number(existingProfile.tier) || 0;

    // Tier 2 allows up to 3 attempts
    const MAX_ATTEMPTS = 3;
    const { data: newAttemptCount, error: rpcError } = await supabaseAdmin.rpc(
      "increment_kyc_attempts",
      { p_wallet_address: walletAddress, p_max_attempts: MAX_ATTEMPTS },
    );
    if (rpcError) {
      report.failed({
        ...idContext,
        stage: "attempt_counter",
        reason: "supabase_error",
        provider: "supabase",
        providerCode: rpcError.code,
        detail: rpcError.message,
        tierFrom,
        statusCode: 500,
      });
      return NextResponse.json(
        { status: "error", message: "Failed to process verification attempt." },
        { status: 500 },
      );
    }
    if (newAttemptCount === -1) {
      report.rejected({
        ...idContext,
        stage: "attempt_counter",
        reason: "no_kyc_profile",
        tierFrom,
        statusCode: 404,
      });
      return NextResponse.json(
        {
          status: "error",
          message: "KYC profile not found. Please complete phone verification first.",
        },
        { status: 404 },
      );
    }
    if (newAttemptCount === -2) {
      // The user is now stuck until support intervenes — the one rejection
      // that always needs a human, so it must be findable by wallet address.
      report.rejected({
        ...idContext,
        stage: "attempt_counter",
        reason: "attempts_exhausted",
        tierFrom,
        attempt: MAX_ATTEMPTS,
        attemptsRemaining: 0,
        statusCode: 429,
      });
      return NextResponse.json(
        {
          status: "error",
          message: "Maximum verification attempts reached. Please contact support.",
        },
        { status: 429 },
      );
    }

    const attemptContext = {
      attempt: Number(newAttemptCount) || null,
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - (Number(newAttemptCount) || 0)),
    };

    // Use server utility to submit SmileID job
    type SmileIdResultType = {
      job_complete: boolean;
      id_info?: any;
      [key: string]: any;
    };

    let smileIdResult: SmileIdResultType = { job_complete: false };
    let job_id = "";
    let user_id = "";
    try {
      const result = await submitSmileIDJob({
        images,
        partner_params,
        walletAddress,
        id_info: id_info as SmileIDIdInfo,
      });
      smileIdResult = { job_complete: false, ...result.smileIdResult };
      job_id = result.job_id;
      user_id = result.user_id;
    } catch (err) {
      if (err instanceof SmileIdValidationError) {
        report.rejected({
          ...idContext,
          ...attemptContext,
          stage: "provider_submit",
          reason: "id_info_validation_failed",
          detail: err.message,
          tierFrom,
          statusCode: 400,
        });
        return NextResponse.json(
          { status: "error", message: err.message },
          { status: 400 },
        );
      }
      // Misconfiguration and Smile ID transport failures both land here, and
      // both look identical to the user ("verification failed").
      report.failed({
        ...idContext,
        ...attemptContext,
        stage: "provider_submit",
        reason: "provider_request_failed",
        detail: err instanceof Error ? err.message : String(err),
        error: err,
        tierFrom,
        jobType: getJobTypeForIdType(id_info.id_type),
        statusCode: 500,
      });
      return NextResponse.json(
        {
          status: "error",
          message: err instanceof Error ? err.message : "SmileID job failed",
        },
        { status: 500 },
      );
    }

    // Enhanced KYC (Job Type 5) returns Actions.Verify_ID_Number
    // Biometric KYC (Job Type 1) returns job_complete and job_success
    const actions = smileIdResult?.Actions;
    const isEnhancedKyc = actions?.Verify_ID_Number !== undefined;
    const isBiometricKyc = !isEnhancedKyc;

    let verificationSuccess = false;

    if (isEnhancedKyc) {
      // Enhanced KYC: Check if ID verification passed
      verificationSuccess = actions.Verify_ID_Number === "Verified";
    } else if (isBiometricKyc) {
      // Biometric KYC: job is complete — check whether it succeeded
      verificationSuccess =
        smileIdResult.job_complete && smileIdResult.job_success;
    }

    if (!verificationSuccess) {
      const errorMessage =
        smileIdResult?.ResultText || "SmileID verification failed";
      const category = classifySmileIdFailure(errorMessage);

      const isInfrastructureFailure = category === "database";

      // The line support reads. `detail` is Smile ID's own ResultText — the
      // actual reason the upgrade failed — and the category decides whether
      // this is a user-facing rejection or an outage worth paging on.
      const outcomeContext = {
        ...idContext,
        ...attemptContext,
        // The refund below restores the try, so report what the user can
        // actually retry with rather than the pre-refund count. If the refund
        // itself fails it gets its own line.
        attemptsRemaining: isInfrastructureFailure
          ? Math.max(0, MAX_ATTEMPTS - Math.max(0, newAttemptCount - 1))
          : attemptContext.attemptsRemaining,
        stage: "provider_verify",
        detail: errorMessage,
        failureCategory: category,
        providerCode: smileIdResult?.ResultCode,
        jobId: job_id,
        jobType: getJobTypeForIdType(id_info.id_type),
        tierFrom,
        statusCode: 400,
      };
      if (isInfrastructureFailure) {
        report.failed({ ...outcomeContext, reason: "provider_unavailable" });
      } else {
        report.rejected({ ...outcomeContext, reason: "provider_rejected" });
      }

      // Infrastructure outages should not count against the user's attempt quota
      // regardless of job type (Job Type 1, 5, or 6). Restore the counter that
      // was incremented above so they can retry freely.
      if (isInfrastructureFailure) {
        const { error: restoreError } = await supabaseAdmin
          .from("user_kyc_profiles")
          .update({ attempts: Math.max(0, newAttemptCount - 1) })
          .eq("wallet_address", walletAddress);
        if (restoreError) {
          // The user keeps a try they should have been refunded — silent to
          // them, and only visible here.
          report.failed({
            ...idContext,
            ...attemptContext,
            stage: "attempt_restore",
            reason: "supabase_error",
            provider: "supabase",
            providerCode: restoreError.code,
            detail: restoreError.message,
            tierFrom,
          });
        }
      }

      // Notify on genuine verification failures only — infrastructure ("database")
      // outages are transient and don't count against the user, so don't email them.
      // Resolve the recipient from the authenticated wallet (never the client-supplied
      // `email`) and dispatch after the response so webhook latency can't hold the
      // verification flow open.
      if (category !== "database") {
        notifyKycResultEmail(walletAddress, {
          event: "kyc_result",
          status: "failure",
          tier: 2,
          reason: errorMessage,
        });
      }

      return NextResponse.json(
        {
          status: "error",
          message: errorMessage,
          failureCategory: category,
        },
        { status: 400 },
      );
    }

    // Extract ID info from Smile ID response if available
    const smileIdInfo = smileIdResult?.id_info || {};

    const existingPlatform = Array.isArray(existingProfile?.platform)
      ? existingProfile.platform
      : [];
    const otherVerifications = existingPlatform.filter(
      (p: { type: string }) => p.type !== "id",
    );
    const updatedPlatform = [
      ...otherVerifications,
      {
        type: "id",
        identifier: "smile_id",
        reference: job_id,
        verified: true,
      },
    ];

    // Tier 2 (ID) only after Tier 1 (phone): do not promote from tier 0 straight to 2
    const newTier = tierFrom >= 1 ? Math.max(tierFrom, 2) : tierFrom;

    const derivedFullName =
      smileIdInfo.full_name ||
      (smileIdInfo.first_name && smileIdInfo.last_name
        ? `${smileIdInfo.first_name} ${smileIdInfo.last_name}`
        : null) ||
      null;

    // One verified identity per ID document: the same document must not back
    // multiple wallet profiles (each would get its own monthly limit).
    // `undefined` (not null) when absent: supabase-js drops undefined keys from
    // the update, preserving any previously stored id_number.
    const idNumberToStore: string | undefined =
      smileIdInfo.id_number || id_info.id_number || undefined;
    // Injected/bridge wallets are exempt in both directions — neither checked nor
    // counted as owners. Tier >= 1 is a precondition above, so the flag was already
    // set by send-otp when the profile was created; no header read is needed here.
    const isInjected = existingProfile.is_injected_wallet === true;

    if (idNumberToStore && !isInjected) {
      const { data: idOwner, error: idOwnerError } = await supabaseAdmin
        .from("user_kyc_profiles")
        .select("wallet_address")
        .eq("id_country", id_info.country)
        .eq("id_type", id_info.id_type)
        .eq("id_number", idNumberToStore)
        .gte("tier", 2)
        .eq("is_injected_wallet", false)
        .neq("wallet_address", walletAddress)
        .limit(1)
        .maybeSingle();

      if (idOwnerError) {
        report.failed({
          ...idContext,
          ...attemptContext,
          stage: "duplicate_id_check",
          reason: "supabase_error",
          provider: "supabase",
          providerCode: idOwnerError.code,
          detail: idOwnerError.message,
          tierFrom,
          jobId: job_id,
          statusCode: 500,
        });
        return NextResponse.json(
          { status: "error", message: "Failed to save KYC data" },
          { status: 500 },
        );
      }
      if (idOwner) {
        // Smile ID verified them; we refused. Support cannot resolve this
        // without knowing it happened, and the user is told to contact them.
        report.rejected({
          ...idContext,
          ...attemptContext,
          stage: "duplicate_id_check",
          reason: "duplicate_id_document",
          tierFrom,
          jobId: job_id,
          statusCode: 409,
        });
        return NextResponse.json(
          {
            status: "error",
            message:
              "This ID document is already verified on another account. Please contact support if you believe this is an error.",
          },
          { status: 409 },
        );
      }
    }

    const { data: updatedProfile, error: supabaseError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .update({
        // Email from user's Privy profile (if provided)
        ...(email && { email_address: email }),
        // ID Document fields from id_info or Smile ID response
        id_type: id_info.id_type,
        id_number: idNumberToStore,
        id_country: id_info.country,
        // Personal info from Smile ID response — only overwrite if SmileID returned a name
        ...(derivedFullName ? { full_name: derivedFullName } : {}),
        date_of_birth: smileIdInfo.dob || id_info.dob || null,
        platform: updatedPlatform,
        verified: true,
        verified_at: new Date().toISOString(),
        tier: newTier,
      })
      .eq("wallet_address", walletAddress)
      .select("wallet_address");

    if (supabaseError) {
      // 23505: partial unique index on verified ID documents (concurrent
      // verification of the same document on another non-injected wallet).
      if (supabaseError.code === "23505") {
        report.rejected({
          ...idContext,
          ...attemptContext,
          stage: "profile_update",
          reason: "duplicate_id_document",
          provider: "supabase",
          providerCode: supabaseError.code,
          tierFrom,
          jobId: job_id,
          statusCode: 409,
        });
        return NextResponse.json(
          {
            status: "error",
            message:
              "This ID document is already verified on another account. Please contact support if you believe this is an error.",
          },
          { status: 409 },
        );
      }
      // Verification passed and the write failed: the worst case, because the
      // user has spent an attempt on a document that did verify.
      report.failed({
        ...idContext,
        ...attemptContext,
        stage: "profile_update",
        reason: "supabase_error",
        provider: "supabase",
        providerCode: supabaseError.code,
        detail: supabaseError.message,
        tierFrom,
        jobId: job_id,
        statusCode: 500,
      });
      return NextResponse.json(
        {
          status: "error",
          message: "Failed to save KYC data",
        },
        { status: 500 },
      );
    }

    // Verify that a row was actually updated
    if (!updatedProfile || updatedProfile.length === 0) {
      report.failed({
        ...idContext,
        ...attemptContext,
        stage: "profile_update",
        reason: "no_rows_updated",
        provider: "supabase",
        tierFrom,
        jobId: job_id,
        statusCode: 404,
      });
      return NextResponse.json(
        {
          status: "error",
          message:
            "No KYC profile exists. Please complete phone verification first.",
        },
        { status: 404 },
      );
    }

    // Reset attempt counter on success
    await supabaseAdmin
      .from("user_kyc_profiles")
      .update({ attempts: 0 })
      .eq("wallet_address", walletAddress);

    // Notify once, only on the first promotion to tier 2 (the async callback
    // skips when the profile is already verified, so this won't double-send).
    // Resolve the recipient from the authenticated wallet (never the client-supplied
    // `email`) and dispatch after the response so webhook latency can't block KYC.
    if (newTier >= 2 && tierFrom < 2) {
      notifyKycResultEmail(walletAddress, {
        event: "kyc_result",
        status: "success",
        tier: newTier,
      });
    }

    report.success({
      ...idContext,
      ...attemptContext,
      stage: "profile_update",
      tierFrom,
      tierTo: newTier,
      jobId: job_id,
      jobType: getJobTypeForIdType(id_info.id_type),
      statusCode: 200,
    });

    return NextResponse.json({
      status: "success",
      message: "KYC verification submitted and saved successfully",
      data: {
        jobId: job_id,
        userId: user_id,
      },
    });
  } catch (error) {
    report.failed({
      stage: "unhandled",
      reason: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
      error,
      statusCode: 500,
    });
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
