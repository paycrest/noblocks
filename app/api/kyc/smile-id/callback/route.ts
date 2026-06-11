import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { getSmileIdJobStatus } from "@/app/lib/smileID";

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
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID;
  const apiKey = process.env.SMILE_IDENTITY_API_KEY;

  if (!partnerId || !apiKey) {
    console.error("[smile-id/callback] Missing SMILE_IDENTITY_PARTNER_ID or SMILE_IDENTITY_API_KEY");
    return NextResponse.json({ status: "error", message: "Server misconfiguration" }, { status: 500 });
  }

  // ── Signature verification ──────────────────────────────────────────────────
  const { timestamp, signature } = body;

  if (!timestamp || !signature) {
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
    console.warn("[smile-id/callback] Signature verification failed", { timestamp });
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
    console.warn("[smile-id/callback] Stale or unparseable timestamp", { timestamp });
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
    console.error("[smile-id/callback] Could not extract wallet address", { rawUserId });
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
    .select("tier, verified, platform")
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (fetchError) {
    console.error("[smile-id/callback] Failed to fetch profile", { walletAddress, fetchError });
    // Return 500 so SmileID retries delivery.
    return NextResponse.json({ status: "error", message: "Database error" }, { status: 500 });
  }

  if (!existing) {
    console.warn("[smile-id/callback] No KYC profile found for wallet", { walletAddress });
    return NextResponse.json({ status: "ok", action: "none" });
  }

  // Already verified at tier 2+ — the sync response handled it; nothing to do.
  if (existing.verified && Number(existing.tier) >= 2) {
    console.log("[smile-id/callback] Profile already verified, skipping", { walletAddress });
    return NextResponse.json({ status: "ok", action: "already_verified" });
  }

  // ── Confirm the outcome with SmileID before trusting it ────────────────────
  // Body fields are not covered by the callback signature; only proceed if
  // SmileID's signed job_status API reports the same success.
  if (!jobId) {
    console.warn("[smile-id/callback] Missing job_id, cannot confirm job — no action", {
      walletAddress,
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
      console.log("[smile-id/callback] job_status did not confirm verification — no action", {
        walletAddress,
        jobId,
        job_complete: jobStatus?.job_complete,
        job_success: jobStatus?.job_success,
        ResultCode: jobStatus?.result?.ResultCode,
      });
      return NextResponse.json({ status: "ok", action: "none" });
    }

    const statusResult = (jobStatus?.result ?? {}) as Record<string, any>;
    signedIdInfo = statusResult.id_info ?? statusResult.ID_Info ?? {};
  } catch (e) {
    console.error("[smile-id/callback] job_status confirmation failed", {
      walletAddress,
      jobId,
      error: e instanceof Error ? e.message : e,
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
    console.error("[smile-id/callback] Failed to update profile", { walletAddress, updateError });
    // Return 500 so SmileID retries.
    return NextResponse.json({ status: "error", message: "Database update failed" }, { status: 500 });
  }

  console.log("[smile-id/callback] Profile verified via async callback", {
    walletAddress,
    jobId,
    newTier,
  });

  return NextResponse.json({ status: "ok", action: "verified" });
}
