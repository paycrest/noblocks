import { NextRequest, NextResponse } from "next/server";
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
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();
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
    const { data: existingProfile } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select(
        "tier, verified, verified_at, id_country, id_type, platform, full_name",
      )
      .eq("wallet_address", walletAddress.toLowerCase())
      .single();

    const isNigerian = validation.isNigerian;
    const expiresAt = new Date(Date.now() + (isNigerian ? 5 : 10) * 60 * 1000); // 5 min KudiSMS, 10 min Twilio Verify

    // Nigerian: we generate OTP and store it. Non-Nigerian: Twilio Verify sends its own code, we don't store one.
    const otp = isNigerian ? generateOTP() : null;

    // Store verification record (otp_code only for Nigerian/KudiSMS path)
    const { error: dbError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .upsert(
        {
          wallet_address: walletAddress.toLowerCase(),
          user_id: userId,
          full_name: name || existingProfile?.full_name || null,
          phone_number: validation.e164Format,
          otp_code: otp,
          expires_at: expiresAt.toISOString(),
          verified: existingProfile?.verified || false,
          verified_at: existingProfile?.verified_at || null,
          tier: existingProfile?.tier || 0,
          id_country: existingProfile?.id_country || null,
          id_type: existingProfile?.id_type || null,
          platform: existingProfile?.platform || null,
          attempts: 0,
          provider: validation.provider,
        },
        {
          onConflict: "wallet_address",
        },
      );

    if (dbError) {
      console.error("Database error:", dbError);
      trackApiError(request, "/api/phone/send-otp", "POST", dbError, 500);
      return NextResponse.json(
        { success: false, error: "Failed to store verification data" },
        { status: 500 },
      );
    }

    // Nigerian: KudiSMS with our OTP. Non-Nigerian: Twilio Verify (Twilio sends its own code).
    let result;
    if (isNigerian) {
      result = await sendKudiSMSOTP(validation.digitsOnly!, otp!);
    } else {
      result = await sendTwilioVerifyOTP(validation.e164Format!);
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse(
      "/api/phone/send-otp",
      "POST",
      result.success ? 200 : 400,
      responseTime,
    );

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || result.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      provider: validation.provider,
      phoneNumber: validation.internationalFormat,
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    trackApiError(request, "/api/phone/send-otp", "POST", error as Error, 500);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
