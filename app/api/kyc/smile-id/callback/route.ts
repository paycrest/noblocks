import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";

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

  // ── Check job outcome ───────────────────────────────────────────────────────
  const jobComplete = body.job_complete === true || body.job_complete === "true";
  const jobSuccessRaw = body.job_success === true || body.job_success === "true";

  // Support both top-level and nested result shapes SmileID may send.
  const result = body.result ?? body.Result ?? {};
  const actions = result.Actions ?? result.actions ?? body.Actions ?? {};
  const isEnhancedKyc = actions.Verify_ID_Number !== undefined;

  let verificationSuccess = false;
  if (isEnhancedKyc) {
    verificationSuccess = actions.Verify_ID_Number === "Verified";
  } else {
    verificationSuccess = jobComplete && jobSuccessRaw;
  }

  if (!verificationSuccess) {
    // SmileID may still send a callback for failed/incomplete jobs. Acknowledge
    // with 200 so SmileID doesn't keep retrying, but take no action.
    console.log("[smile-id/callback] Job not verified, no action taken", {
      walletAddress,
      jobId,
      jobComplete,
      jobSuccessRaw,
      ResultCode: result.ResultCode,
      ResultText: result.ResultText,
    });
    return NextResponse.json({ status: "ok", action: "none" });
  }

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

  // Build updated platform array, replacing any prior "id" entry.
  const existingPlatform = Array.isArray(existing.platform) ? existing.platform : [];
  const updatedPlatform = [
    ...existingPlatform.filter((p: { type: string }) => p.type !== "id"),
    { type: "id", identifier: "smile_id", reference: jobId, verified: true },
  ];

  const currentTier = Number(existing.tier) || 0;
  const newTier = currentTier >= 1 ? Math.max(currentTier, 2) : currentTier;

  // Optionally enrich with personal info if SmileID included it in the callback.
  const smileIdInfo = result.id_info ?? result.ID_Info ?? {};
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
