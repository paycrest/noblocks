import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/app/lib/supabase";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "../../../lib/server-analytics";
import {
  validatePhoneNumber,
  checkTwilioVerifyCode,
} from "@/app/lib/phone-verification";

const MAX_ATTEMPTS = 3;

function hashOTP(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    trackApiRequest(request, "/api/phone/verify-otp", "POST");

    const body = await request.json();
    const { phoneNumber, otpCode } = body;

    // Use authenticated wallet address from middleware
    const walletAddress = request.headers.get("x-wallet-address");

    if (!walletAddress) {
      trackApiError(
        request,
        "/api/phone/verify-otp",
        "POST",
        new Error("Unauthorized"),
        401,
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    if (!phoneNumber || !otpCode) {
      trackApiError(
        request,
        "/api/phone/verify-otp",
        "POST",
        new Error("Missing required fields"),
        400,
      );
      return NextResponse.json(
        { success: false, error: "Phone number and OTP code are required" },
        { status: 400 },
      );
    }

    // Normalize phone number to E.164 format for consistent querying
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.isValid || !validation.e164Format) {
      trackApiError(
        request,
        "/api/phone/verify-otp",
        "POST",
        new Error("Invalid phone format"),
        400,
      );
      return NextResponse.json(
        { success: false, error: "Invalid phone number format" },
        { status: 400 },
      );
    }

    // Get verification record using normalized E.164 format
    const { data: verification, error: fetchError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("verified, provider, tier, expires_at, attempts, otp_code")
      .eq("wallet_address", walletAddress)
      .eq("phone_number", validation.e164Format)
      .single();

    if (fetchError) {
      trackApiError(request, "/api/phone/verify-otp", "POST", fetchError, 500);
      return NextResponse.json(
        { success: false, error: "Failed to fetch verification record" },
        { status: 500 },
      );
    }

    if (!verification) {
      trackApiError(
        request,
        "/api/phone/verify-otp",
        "POST",
        new Error("Verification not found"),
        404,
      );
      return NextResponse.json(
        { success: false, error: "Verification record not found" },
        { status: 404 },
      );
    }

    // Check if already verified
    if (verification.verified) {
      const responseTime = Date.now() - startTime;
      trackApiResponse("/api/phone/verify-otp", "POST", 200, responseTime);
      return NextResponse.json({
        success: true,
        message: "Phone number already verified",
        verified: true,
      });
    }

    // Twilio Verify path: validate code via Twilio (no DB OTP comparison)
    if (verification.provider === "twilio") {
      const checkResult = await checkTwilioVerifyCode(
        validation.e164Format!,
        otpCode,
      );
      if (!checkResult.success) {
        trackApiError(
          request,
          "/api/phone/verify-otp",
          "POST",
          new Error(checkResult.error || "Verification failed"),
          400,
        );
        return NextResponse.json(
          {
            success: false,
            error:
              checkResult.error ||
              "Invalid or expired code. Please try again or request a new code.",
          },
          { status: 400 },
        );
      }
      // Twilio approved: update profile (same as below)
      const updateData: Record<string, unknown> = {
        verified: true,
        verified_at: new Date().toISOString(),
        otp_code: null,
        attempts: 0,
      };
      if (verification.tier === 0) {
        updateData.tier = 1;
      }
      const { error: updateError } = await supabaseAdmin
        .from("user_kyc_profiles")
        .update(updateData)
        .eq("wallet_address", walletAddress);
      if (updateError) {
        trackApiError(
          request,
          "/api/phone/verify-otp",
          "POST",
          updateError,
          500,
        );
        return NextResponse.json(
          { success: false, error: "Failed to update verification status" },
          { status: 500 },
        );
      }
      const responseTime = Date.now() - startTime;
      trackApiResponse("/api/phone/verify-otp", "POST", 200, responseTime);
      return NextResponse.json({
        success: true,
        message: "Phone number verified successfully",
        verified: true,
        phoneNumber,
      });
    }

    // KudiSMS path: expiry, attempts, and DB OTP comparison
    if (new Date() > new Date(verification.expires_at)) {
      return NextResponse.json(
        { success: false, error: "OTP has expired. Please request a new one." },
        { status: 400 },
      );
    }

    if (verification.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Maximum verification attempts exceeded. Please request a new OTP.",
        },
        { status: 429 },
      );
    }

    if (verification.otp_code !== hashOTP(otpCode)) {
      // Atomic increment with boundary check to prevent race conditions
      const { data: updated, error: attemptsError } = await supabaseAdmin
        .from("user_kyc_profiles")
        .update({ attempts: verification.attempts + 1 })
        .eq("wallet_address", walletAddress)
        .lt("attempts", MAX_ATTEMPTS)
        .select("attempts")
        .single();

      if (attemptsError) {
        trackApiError(
          request,
          "/api/phone/verify-otp",
          "POST",
          attemptsError,
          500,
        );
        return NextResponse.json(
          { success: false, error: "Failed to process verification attempt" },
          { status: 500 },
        );
      }

      // If no rows updated, attempts limit was hit mid-flight (race condition)
      if (!updated) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Maximum verification attempts exceeded. Please request a new OTP.",
          },
          { status: 429 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Invalid OTP code",
          attemptsRemaining: MAX_ATTEMPTS - updated.attempts,
        },
        { status: 400 },
      );
    }

    // Mark as verified - preserve existing tier if higher than 1
    const updateData: Record<string, unknown> = {
      verified: true,
      verified_at: new Date().toISOString(),
      otp_code: null, // Clear OTP hash after successful verification
      attempts: 0,
    };

    // Only set tier to 1 if current tier is 0 (unverified)
    if (verification.tier === 0) {
      updateData.tier = 1;
    }

    const { error: updateError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .update(updateData)
      .eq("wallet_address", walletAddress);

    if (updateError) {
      trackApiError(request, "/api/phone/verify-otp", "POST", updateError, 500);
      return NextResponse.json(
        { success: false, error: "Failed to update verification status" },
        { status: 500 },
      );
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/phone/verify-otp", "POST", 200, responseTime);

    return NextResponse.json({
      success: true,
      message: "Phone number verified successfully",
      verified: true,
      phoneNumber: phoneNumber,
    });
  } catch (error) {
    trackApiError(
      request,
      "/api/phone/verify-otp",
      "POST",
      error as Error,
      500,
    );

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
