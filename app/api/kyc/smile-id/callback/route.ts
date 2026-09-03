import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { getSmileIdJobStatus } from "@/app/lib/smileID";
import { notifyKycResultEmail } from "@/app/lib/activepieces-kyc-result";
import { createKycReporter } from "@/app/lib/kyc-telemetry";

// The callback signature only covers timestamp + partner_id (per SmileID's
// protocol), NOT the body. A captured (timestamp, signature) pair could be
// replayed with an arbitrary body, so two extra defenses below:
//  1. reject callbacks whose timestamp is outside MAX_CALLBACK_AGE_MS, and
//  2. before any profile update, confirm the job outcome via SmileID's signed
//     job_status API instead of trusting body fields.
const MAX_CALLBACK_AGE_MS = 60 * 60 * 1000; // generous: SmileID retries failed deliveries

function parseSmileTimestampMs(timestamp: string): number | null {
  // smile-identity-core signs ISO-8601 timestamps; tolerate epoch seconds/millis too.
  if (/^\d{13}$/.test(timestamp)) return Number(timestamp);
  if (/^\d{10}$/.test(timestamp)) return Number(timestamp) * 1000;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

// SmileID sends callbacks signed with HMAC-SHA256.
// Algorithm: base64(HMAC-SHA256(timestamp + partnerId + "sid_request", apiKey))
// This mirrors the Signature class in smile-identity-core/dist/src/signature.js.
function confirmSmileSignature(
  timestamp: string,
  signature: string,
  partnerId: string,
  apiKey: string,
): boolean {
  const { createHmac } = require("crypto") as typeof import("crypto");
  const hmac = createHmac("sha256", apiKey);
  hmac.update(timestamp, "utf8");
  hmac.update(partnerId, "utf8");
  hmac.update("sid_request", "utf8");
  const expected = hmac.digest().toString("base64");
  // Constant-time comparison to prevent timing attacks.
  if (expected.length !== signature.length) return false;
  const { timingSafeEqual } = require("crypto") as typeof import("crypto");
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(request: NextRequest) {
  // The wallet is only known once the body is parsed, so the reporter starts
  // without one and each call supplies it as soon as it is available.
  const report = createKycReporter({
    step: "id_callback",
    targetTier: 2,
    provider: "smile_id",
  });

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    report.rejected({
      stage: "request_validation",
      reason: "invalid_json",
      statusCode: 400,
    });
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID;
  const apiKey = process.env.SMILE_IDENTITY_API_KEY;

  if (!partnerId || !apiKey) {
    report.failed({
      stage: "provider_config",
      reason: "missing_provider_config",
      detail:
        "SMILE_IDENTITY_PARTNER_ID or SMILE_IDENTITY_API_KEY is not set",
      statusCode: 500,
    });
    return NextResponse.json({ status: "error", message: "Server misconfiguration" }, { status: 500 });
  }

  // ── Signature verification ──────────────────────────────────────────────────
  const { timestamp, signature } = body;

  if (!timestamp || !signature) {
    report.rejected({
      stage: "signature_check",
      reason: "missing_signature_fields",
      statusCode: 400,
    });
    return NextResponse.json(
      { status: "error", message: "Missing signature fields" },
      { status: 400 },
    );
  }

  const isValid = confirmSmileSignature(
    String(timestamp),
    String(signature),
    partnerId,
    apiKey,
  );

  if (!isValid) {
    // Worth alerting on: a genuine Smile ID callback never fails this.
    report.rejected({
      stage: "signature_check",
      reason: "invalid_signature",
      statusCode: 401,
    });
    return NextResponse.json(
      { status: "error", message: "Invalid signature" },
      { status: 401 },
    );
  }

  // Freshness check: the signature is replayable, so cap how old a callback may be.
  const timestampMs = parseSmileTimestampMs(String(timestamp));
  if (
    timestampMs === null ||
    Math.abs(Date.now() - timestampMs) > MAX_CALLBACK_AGE_MS
  ) {
    report.rejected({
      stage: "signature_check",
      reason: "stale_callback",
      statusCode: 401,
    });
    return NextResponse.json(
      { status: "error", message: "Stale callback" },
      { status: 401 },
    );
  }

  // ── Extract wallet address from partner_params.user_id ─────────────────────
  // Our submit_job sets user_id = `user-${walletAddress}` (see app/lib/smileID.ts).
  const partnerParams = body.partner_params ?? body.PartnerParams ?? {};
  const rawUserId: string = String(partnerParams.user_id ?? "");
  const walletAddress = rawUserId.startsWith("user-")
    ? rawUserId.slice(5)
    : rawUserId;

  if (!walletAddress) {
    report.failed({
      stage: "request_validation",
      reason: "missing_user_identifier",
      statusCode: 400,
    });
    return NextResponse.json(
      { status: "error", message: "Missing user identifier" },
      { status: 400 },
    );
  }

  const jobId: string = String(partnerParams.job_id ?? "");

  // The body is NOT covered by the callback signature, so it is used for
  // routing only (which user/job to look up). The job outcome and any profile
  // enrichment below come exclusively from SmileID's signed job_status API.

  // ── Update KYC profile ─────────────────────────────────────────────────────
  // Fetch current profile to avoid overwriting a higher tier or clobbering
  // existing verified data that the sync response already wrote.
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("user_kyc_profiles")
    .select(
      "tier, verified, platform, id_country, id_type, id_number, is_injected_wallet",
    )
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (fetchError) {
    report.failed({
      walletAddress,
      stage: "profile_fetch",
      reason: "supabase_error",
      provider: "supabase",
      providerCode: fetchError.code,
      detail: fetchError.message,
      jobId,
      statusCode: 500,
    });
    // Return 500 so SmileID retries delivery.
    return NextResponse.json({ status: "error", message: "Database error" }, { status: 500 });
  }

  if (!existing) {
    report.rejected({
      walletAddress,
      stage: "profile_fetch",
      reason: "no_kyc_profile",
      jobId,
      statusCode: 200,
    });
    return NextResponse.json({ status: "ok", action: "none" });
  }

  // Already verified at tier 2+ — the sync response handled it; nothing to do.
  if (existing.verified && Number(existing.tier) >= 2) {
    // The expected path: the synchronous submission already promoted them.
    report.noop({
      walletAddress,
      stage: "profile_fetch",
      reason: "already_verified",
      tierFrom: Number(existing.tier) || 0,
      jobId,
      statusCode: 200,
    });
    return NextResponse.json({ status: "ok", action: "already_verified" });
  }

  // ── Confirm the outcome with SmileID before trusting it ────────────────────
  // Body fields are not covered by the callback signature; only proceed if
  // SmileID's signed job_status API reports the same success.
  if (!jobId) {
    report.rejected({
      walletAddress,
      stage: "job_status_confirm",
      reason: "missing_job_id",
      tierFrom: Number(existing.tier) || 0,
      statusCode: 200,
    });
    return NextResponse.json({ status: "ok", action: "none" });
  }

  let signedIdInfo: Record<string, any> = {};
  try {
    const jobStatus = await getSmileIdJobStatus(rawUserId, jobId);
    const statusActions = jobStatus?.result?.Actions ?? {};
    const statusIsEnhancedKyc = statusActions.Verify_ID_Number !== undefined;
    // SmileID returns booleans or "true"/"false" strings depending on surface
    const flag = (v: unknown) => v === true || v === "true";
    const confirmed = statusIsEnhancedKyc
      ? statusActions.Verify_ID_Number === "Verified"
      : flag(jobStatus?.job_complete) && flag(jobStatus?.job_success);

    if (!confirmed) {
      // Covers failed/incomplete jobs too: SmileID sends callbacks for those,
      // and the signed status is the only outcome we act on.
      // A failed or still-incomplete job. Smile ID calls back for both, and
      // the signed status is the only outcome we act on — so this is where an
      // asynchronously rejected upgrade becomes visible.
      report.rejected({
        walletAddress,
        stage: "job_status_confirm",
        reason: "provider_rejected",
        detail:
          (jobStatus?.result?.ResultText as string) ??
          `job_complete=${jobStatus?.job_complete} job_success=${jobStatus?.job_success}`,
        providerCode: jobStatus?.result?.ResultCode,
        tierFrom: Number(existing.tier) || 0,
        jobId,
        statusCode: 200,
      });
      return NextResponse.json({ status: "ok", action: "none" });
    }

    const statusResult = (jobStatus?.result ?? {}) as Record<string, any>;
    signedIdInfo = statusResult.id_info ?? statusResult.ID_Info ?? {};
  } catch (e) {
    report.failed({
      walletAddress,
      stage: "job_status_confirm",
      reason: "provider_status_failed",
      detail: e instanceof Error ? e.message : String(e),
      error: e,
      jobId,
      statusCode: 500,
    });
    // 500 so SmileID retries once the status API is reachable again.
    return NextResponse.json(
      { status: "error", message: "Unable to confirm job status" },
      { status: 500 },
    );
  }

  // Build updated platform array, replacing any prior "id" entry.
  const existingPlatform = Array.isArray(existing.platform) ? existing.platform : [];
  const updatedPlatform = [
    ...existingPlatform.filter((p: { type: string }) => p.type !== "id"),
    { type: "id", identifier: "smile_id", reference: jobId, verified: true },
  ];

  const currentTier = Number(existing.tier) || 0;
  const newTier = currentTier >= 1 ? Math.max(currentTier, 2) : currentTier;

  // Optionally enrich with personal info from the signed job_status response.
  const smileIdInfo = signedIdInfo;
  const derivedFullName =
    smileIdInfo.full_name ||
    (smileIdInfo.first_name && smileIdInfo.last_name
      ? `${smileIdInfo.first_name} ${smileIdInfo.last_name}`
      : null) ||
    null;

  // Raising tier to 2 can newly pull this row into uniq_user_kyc_profiles_verified_id
  // (the index covers tier >= 2 only), even though no id_number is written here. If
  // another non-injected wallet already holds this document, the promotion can never
  // succeed — so refuse it deliberately instead of letting a 23505 surface as a 500
  // that SmileID retries forever.
  if (
    newTier >= 2 &&
    existing.id_number &&
    existing.is_injected_wallet !== true
  ) {
    const { data: idOwner, error: idOwnerError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("wallet_address")
      .eq("id_country", existing.id_country)
      .eq("id_type", existing.id_type)
      .eq("id_number", existing.id_number)
      .gte("tier", 2)
      .eq("is_injected_wallet", false)
      .neq("wallet_address", walletAddress)
      .limit(1)
      .maybeSingle();

    if (idOwnerError) {
      report.failed({
        walletAddress,
        stage: "duplicate_id_check",
        reason: "supabase_error",
        provider: "supabase",
        providerCode: idOwnerError.code,
        detail: idOwnerError.message,
        jobId,
        statusCode: 500,
      });
      // Transient: 500 so SmileID retries.
      return NextResponse.json(
        { status: "error", message: "Database error" },
        { status: 500 },
      );
    }

    if (idOwner) {
      report.rejected({
        walletAddress,
        stage: "duplicate_id_check",
        reason: "duplicate_id_document",
        tierFrom: currentTier,
        jobId,
        statusCode: 200,
      });
      // 200: the conflict is permanent, so retrying would loop forever.
      return NextResponse.json({
        status: "ok",
        action: "duplicate_id_conflict",
      });
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("user_kyc_profiles")
    .update({
      platform: updatedPlatform,
      verified: true,
      verified_at: new Date().toISOString(),
      tier: newTier,
      ...(derivedFullName ? { full_name: derivedFullName } : {}),
      ...(smileIdInfo.dob ? { date_of_birth: smileIdInfo.dob } : {}),
    })
    .eq("wallet_address", walletAddress);

  if (updateError) {
    // Same conflict, lost to a concurrent verification after the check above.
    // Still permanent — do not ask SmileID to retry.
    if (updateError.code === "23505") {
      report.rejected({
        walletAddress,
        stage: "profile_update",
        reason: "duplicate_id_document",
        provider: "supabase",
        providerCode: updateError.code,
        tierFrom: currentTier,
        jobId,
        statusCode: 200,
      });
      return NextResponse.json({
        status: "ok",
        action: "duplicate_id_conflict",
      });
    }
    report.failed({
      walletAddress,
      stage: "profile_update",
      reason: "supabase_error",
      provider: "supabase",
      providerCode: updateError.code,
      detail: updateError.message,
      tierFrom: currentTier,
      jobId,
      statusCode: 500,
    });
    // Return 500 so SmileID retries.
    return NextResponse.json({ status: "error", message: "Database update failed" }, { status: 500 });
  }

  report.success({
    walletAddress,
    stage: "profile_update",
    tierFrom: currentTier,
    tierTo: newTier,
    jobId,
    statusCode: 200,
  });

  // Notify once, only on the first promotion to tier 2. Earlier guards already
  // return when the profile is verified at tier 2+, so this won't double-send
  // alongside the synchronous submission path. Dispatch after the response so
  // webhook latency can't hold the callback acknowledgement open.
  if (newTier >= 2 && currentTier < 2) {
    notifyKycResultEmail(walletAddress, {
      event: "kyc_result",
      status: "success",
      tier: newTier,
    });
  }

  return NextResponse.json({ status: "ok", action: "verified" });
}
