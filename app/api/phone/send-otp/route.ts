import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/app/lib/supabase";
import {
  validatePhoneNumber,
  sendKudiSMSOTP,
  sendTwilioVerifyOTP,
  generateOTP,
} from "../../../lib/phone-verification";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "../../../lib/server-analytics";
import { rateLimit } from "@/app/lib/rate-limit";

function hashOTP(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Rate limit check
    const rateLimitResult = await rateLimit(request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    trackApiRequest(request, "/api/phone/send-otp", "POST");

    const body = await request.json();
    const { phoneNumber, name } = body;

    // Use authenticated wallet address and user ID from middleware
    const walletAddress = request.headers.get("x-wallet-address");
    const userId = request.headers.get("x-user-id");

    if (!walletAddress) {
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

    // Get existing profile to preserve important fields
    const { data: existingProfile, error: profileFetchError } =
      await supabaseAdmin
        .from("user_kyc_profiles")
        .select(
          "tier, verified, verified_at, id_country, id_type, platform, full_name, phone_number",
        )
        .eq("wallet_address", walletAddress)
        .maybeSingle();

    if (profileFetchError) {
      trackApiError(
        request,
        "/api/phone/send-otp",
        "POST",
        profileFetchError,
        500,
      );
      return NextResponse.json(
        { success: false, error: "Failed to load profile" },
        { status: 500 },
      );
    }

    const isNigerian = validation.isNigerian;
    const expiresAt = new Date(Date.now() + (isNigerian ? 5 : 10) * 60 * 1000); // 5 min KudiSMS, 10 min Twilio Verify

    // Nigerian: we generate OTP, hash it, and store the hash. Non-Nigerian: Twilio Verify sends its own code.
    const otp = isNigerian ? generateOTP() : null;
    const otpHash = otp ? hashOTP(otp) : null;

    const phoneNumberChanged =
      existingProfile?.phone_number != null &&
      existingProfile.phone_number !== validation.e164Format;

    // Send OTP via provider BEFORE persisting — do not de-verify or overwrite active
    // phone state if the provider call fails.
    let result;
    if (isNigerian) {
      result = await sendKudiSMSOTP(validation.digitsOnly!, otp!);
    } else {
      result = await sendTwilioVerifyOTP(validation.e164Format!);
    }

    if (!result.success) {
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

    // Provider confirmed: now persist the pending OTP state.
    const { error: dbError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .upsert(
        {
          wallet_address: walletAddress,
          user_id: userId,
          full_name: name || existingProfile?.full_name || null,
          phone_number: validation.e164Format,
          otp_code: otpHash,
          expires_at: expiresAt.toISOString(),
          verified: phoneNumberChanged
            ? false
            : existingProfile?.verified || false,
          verified_at: phoneNumberChanged
            ? null
            : existingProfile?.verified_at || null,
          tier: existingProfile?.tier || 0,
          id_country: existingProfile?.id_country || null,
          id_type: existingProfile?.id_type || null,
          platform: existingProfile?.platform || null,
          otp_attempts: 0, // reset OTP counter on each new OTP send; leave `attempts` (SmileID) untouched
          provider: validation.provider,
        },
        {
          onConflict: "wallet_address",
        },
      );

    if (dbError) {
      trackApiError(request, "/api/phone/send-otp", "POST", dbError, 500);
      return NextResponse.json(
        { success: false, error: "Failed to store verification data" },
        { status: 500 },
      );
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/phone/send-otp", "POST", 200, responseTime);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      provider: validation.provider,
      phoneNumber: validation.internationalFormat,
    });
  } catch (error) {
    trackApiError(request, "/api/phone/send-otp", "POST", error as Error, 500);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
