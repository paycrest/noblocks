import { NextRequest, NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { supabaseAdmin } from "@/app/lib/supabase";
import { validatePhoneNumber } from "../../../lib/phone-validation";
import { sendKudiSMSOTP, sendTwilioVerifyOTP } from "../../../lib/phone-verification";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "../../../lib/server-analytics";
import { rateLimit } from "@/app/lib/rate-limit";
import { isInjectedUserId } from "@/app/lib/injected-identity";
import { createKycReporter } from "@/app/lib/kyc-telemetry";

function hashOTP(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

function generateOtpCode(): string {
  return randomInt(100000, 1000000).toString();
}

/** Align with user_kyc_profiles_tier_check (0–4). Corrupt/non-numeric tiers would fail the upsert after OTP is sent. */
function clampKycTier(tier: unknown): number {
  const n = Number(tier ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), 4);
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  // Tier 1 starts here: an OTP that never arrives is the first thing support
  // is asked about, and until now nothing recorded the provider's answer.
  const report = createKycReporter({ step: "phone_otp_send", targetTier: 1 });

  try {
    // Rate limit check
    const rateLimitResult = await rateLimit(request);
    if (!rateLimitResult.success) {
      report.rejected({ reason: "rate_limited", statusCode: 429 });
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    trackApiRequest(request, "/api/phone/send-otp", "POST");

    const body = await request.json();
    const { phoneNumber, name, countryIso } = body;

    // Use authenticated wallet address and user ID from middleware
    const walletAddress = request.headers.get("x-wallet-address");
    const userId = request.headers.get("x-user-id");

    if (!walletAddress) {
      // Not an unauthenticated user: middleware matches these routes, turns
      // those away with its own 401, and strips forged wallet headers. Reaching
      // the handler without one means the matcher or header propagation broke.
      report.failed({ reason: "unauthorized", statusCode: 401 });
      trackApiError(
        request,
        "/api/phone/send-otp",
        "POST",
        new Error("Unauthorized"),
        401,
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    if (!phoneNumber) {
      report.rejected({
        walletAddress,
        stage: "request_validation",
        reason: "missing_phone_number",
        statusCode: 400,
      });
      trackApiError(
        request,
        "/api/phone/send-otp",
        "POST",
        new Error("Missing required fields"),
        400,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Phone number is required",
        },
        { status: 400 },
      );
    }

    // Validate phone number
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.isValid) {
      // Never log the number itself — the country it parsed to is enough to
      // tell a corridor problem from a user typo.
      report.rejected({
        walletAddress,
        stage: "request_validation",
        reason: "invalid_phone_format",
        idCountry: validation.country,
        statusCode: 400,
      });
      trackApiError(
        request,
        "/api/phone/send-otp",
        "POST",
        new Error("Invalid phone number format"),
        400,
      );
      return NextResponse.json(
        { success: false, error: "Invalid phone number format" },
        { status: 400 },
      );
    }

    if (
      typeof countryIso === "string" &&
      countryIso.trim() &&
      validation.country &&
      validation.country !== countryIso.trim().toUpperCase()
    ) {
      report.rejected({
        walletAddress,
        stage: "request_validation",
        reason: "phone_country_mismatch",
        idCountry: validation.country,
        statusCode: 400,
      });
      trackApiError(
        request,
        "/api/phone/send-otp",
        "POST",
        new Error("Phone country mismatch"),
        400,
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "Phone number does not match the selected country. Pick the correct country code.",
        },
        { status: 400 },
      );
    }

    // Get existing profile to preserve important fields
    const { data: existingProfile, error: profileFetchError } =
      await supabaseAdmin
        .from("user_kyc_profiles")
        .select(
          "tier, id_country, id_type, platform, full_name, is_injected_wallet",
        )
        .eq("wallet_address", walletAddress)
        .maybeSingle();

    if (profileFetchError) {
      report.failed({
        walletAddress,
        stage: "profile_fetch",
        reason: "supabase_error",
        provider: "supabase",
        providerCode: profileFetchError.code,
        detail: profileFetchError.message,
        statusCode: 500,
      });
      trackApiError(
        request,
        "/api/phone/send-otp",
        "POST",
        new Error(
          profileFetchError.message
            ? `Supabase select user_kyc_profiles: ${profileFetchError.message}`
            : "Supabase select user_kyc_profiles failed",
        ),
        500,
        {
          supabase_operation: "select_user_kyc_profiles",
          supabase_code: profileFetchError.code,
          supabase_details: profileFetchError.details,
          supabase_hint: profileFetchError.hint,
        },
      );
      return NextResponse.json(
        { success: false, error: "Failed to load profile" },
        { status: 500 },
      );
    }

    // Injected/bridge wallets are exempt from phone uniqueness: one person reaches the
    // app on several self-custodied addresses, and identity-scoped limits
    // (`app/lib/kyc-identity.ts`) already pool their spend, so extra wallets buy no
    // extra allowance. Non-injected callers still get one verified identity per number,
    // and injected rows are skipped when checking so they never block a Privy user.
    const isInjected = isInjectedUserId(userId);

    if (!isInjected) {
      // Refuse before spending an SMS.
      const { data: phoneOwner, error: phoneOwnerError } = await supabaseAdmin
        .from("user_kyc_profiles")
        .select("wallet_address")
        .eq("phone_number", validation.e164Format)
        .gte("tier", 1)
        .eq("is_injected_wallet", false)
        .neq("wallet_address", walletAddress)
        .limit(1)
        .maybeSingle();

      if (phoneOwnerError) {
        report.failed({
          walletAddress,
          stage: "phone_uniqueness_check",
          reason: "supabase_error",
          provider: "supabase",
          providerCode: phoneOwnerError.code,
          detail: phoneOwnerError.message,
          statusCode: 500,
        });
        return NextResponse.json(
          { success: false, error: "Failed to validate phone number" },
          { status: 500 },
        );
      }

      if (phoneOwner) {
        // Common and confusing for the user — they are told to use a different
        // number with no explanation of which account holds this one.
        report.rejected({
          walletAddress,
          stage: "phone_uniqueness_check",
          reason: "duplicate_phone_number",
          idCountry: validation.country,
          statusCode: 409,
        });
        trackApiError(
          request,
          "/api/phone/send-otp",
          "POST",
          new Error("Phone number already verified on another account"),
          409,
        );
        return NextResponse.json(
          {
            success: false,
            error:
              "This phone number is already verified on another account. Please use a different number.",
          },
          { status: 409 },
        );
      }
    }

    const isNigerian = validation.isNigerian;
    const expiresAt = new Date(Date.now() + (isNigerian ? 5 : 10) * 60 * 1000); // 5 min KudiSMS, 10 min Twilio Verify

    // Nigerian: we generate OTP, hash it, and store the hash. Non-Nigerian: Twilio Verify sends its own code.
    const otp = isNigerian ? generateOtpCode() : null;
    const otpHash = otp ? hashOTP(otp) : null;

    // Send OTP via provider BEFORE persisting — do not overwrite active
    // phone state if the provider call fails.
    let result;
    if (isNigerian) {
      result = await sendKudiSMSOTP(validation.digitsOnly!, otp!);
    } else {
      result = await sendTwilioVerifyOTP(validation.e164Format!);
    }

    if (!result.success) {
      // The SMS never went out. Provider-side, so it reads as an error rather
      // than a rejection: KudiSMS and Twilio outages page us, not the user.
      report.failed({
        walletAddress,
        stage: "otp_provider",
        reason: "otp_send_failed",
        provider: isNigerian ? "kudisms" : "twilio",
        detail: result.error || result.message,
        idCountry: validation.country,
        statusCode: 400,
      });
      const responseTime = Date.now() - startTime;
      trackApiResponse(
        "/api/phone/send-otp",
        "POST",
        400,
        responseTime,
      );
      return NextResponse.json(
        {
          success: false,
          error: result.error || result.message,
        },
        { status: 400 },
      );
    }

    // Provider confirmed: persist the pending OTP state. The number stays in
    // pending_phone_number until verify-otp confirms it — phone_number (and the
    // verified flag) only ever reflect a number that passed OTP verification.
    const { error: dbError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .upsert(
        {
          wallet_address: walletAddress,
          user_id: userId?.trim() ? userId.trim() : null,
          full_name: name || existingProfile?.full_name || null,
          pending_phone_number: validation.e164Format,
          otp_code: otpHash,
          expires_at: expiresAt.toISOString(),
          tier: clampKycTier(existingProfile?.tier),
          id_country: existingProfile?.id_country || null,
          id_type: existingProfile?.id_type || null,
          platform: existingProfile?.platform || null,
          otp_attempts: 0, // reset OTP counter on each new OTP send; leave `attempts` (SmileID) untouched
          provider: validation.provider,
          // Sticky: never downgrade true → false. A wallet that verified while injected
          // and is later seen through Privy must keep the exemption — clearing it would
          // pull the row back into the unique index and could fail a valid write (23505).
          is_injected_wallet:
            isInjected || existingProfile?.is_injected_wallet === true,
        },
        {
          onConflict: "wallet_address",
        },
      );

    if (dbError) {
      // The OTP was sent but the hash was not stored, so the code the user is
      // about to receive can never verify.
      report.failed({
        walletAddress,
        stage: "profile_upsert",
        reason: "supabase_error",
        provider: "supabase",
        providerCode: dbError.code,
        detail: dbError.message,
        statusCode: 500,
      });
      trackApiError(
        request,
        "/api/phone/send-otp",
        "POST",
        new Error(
          dbError.message
            ? `Supabase upsert: ${dbError.message}`
            : "Supabase upsert failed",
        ),
        500,
        {
          supabase_operation: "upsert_user_kyc_profiles",
          supabase_code: dbError.code,
          supabase_details: dbError.details,
          supabase_hint: dbError.hint,
        },
      );
      const payload: {
        success: false;
        error: string;
        debug?: Record<string, string | undefined>;
      } = {
        success: false,
        error: "Failed to store verification data",
      };
      if (process.env.NODE_ENV !== "production") {
        payload.debug = {
          message: dbError.message,
          code: dbError.code,
          details: dbError.details,
          hint: dbError.hint,
        };
      }
      return NextResponse.json(payload, { status: 500 });
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/phone/send-otp", "POST", 200, responseTime);

    report.success({
      walletAddress,
      stage: "otp_provider",
      provider: isNigerian ? "kudisms" : "twilio",
      idCountry: validation.country,
      tierFrom: Number(existingProfile?.tier) || 0,
      statusCode: 200,
    });

    return NextResponse.json({
      success: result.success,
      message: result.message,
      provider: validation.provider,
      phoneNumber: validation.internationalFormat,
    });
  } catch (error) {
    report.failed({
      stage: "unhandled",
      reason: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
      error,
      statusCode: 500,
    });
    trackApiError(request, "/api/phone/send-otp", "POST", error as Error, 500);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
