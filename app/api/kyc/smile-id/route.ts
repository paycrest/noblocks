import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { submitSmileIDJob, type SmileIDIdInfo } from "@/app/lib/smileID";
import { rateLimit } from "@/app/lib/rate-limit";

export async function POST(request: NextRequest) {
  // Rate limit check
  const rateLimitResult = await rateLimit(request);
  if (!rateLimitResult.success) {
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
    return NextResponse.json(
      { status: "error", message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const { images, partner_params, id_info, email } = body;

    // Validate required fields
    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { status: "error", message: "Invalid images data" },
        { status: 400 },
      );
    }

    // Validate id_info for Job Type 1 (Biometric KYC)
    if (!id_info?.country || !id_info?.id_type) {
      return NextResponse.json(
        {
          status: "error",
          message: "Missing id_info: country and id_type are required",
        },
        { status: 400 },
      );
    }

    // Use server utility to submit SmileID job
    type SmileIdResultType = {
      job_complete: boolean;
      id_info?: any;
      [key: string]: any;
    };

    let smileIdResult: SmileIdResultType = { job_complete: false },
      job_id: string,
      user_id: string;
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
    const isBiometricKyc = smileIdResult?.job_complete !== undefined;

    let verificationSuccess = false;

    if (isEnhancedKyc) {
      // Enhanced KYC: Check if ID verification passed
      verificationSuccess = actions.Verify_ID_Number === "Verified";
    } else if (isBiometricKyc) {
      // Biometric KYC: Check job_complete and job_success
      verificationSuccess =
        smileIdResult.job_complete && smileIdResult.job_success;
    }

    if (!verificationSuccess) {
      const errorMessage =
        smileIdResult?.ResultText || "SmileID verification failed";
      return NextResponse.json(
        {
          status: "error",
          message: errorMessage,
        },
        { status: 400 },
      );
    }

    // Extract ID info from Smile ID response if available
    const smileIdInfo = smileIdResult?.id_info || {};

    const { data: existingProfile } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("platform, tier")
      .eq("wallet_address", walletAddress)
      .single();

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

    // Prevent tier downgrade — only upgrade to 2 if current tier is lower
    const currentTier = Number(existingProfile?.tier) || 0;
    const newTier = Math.max(currentTier, 2);

    const { data: updatedProfile, error: supabaseError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .update({
        // Email from user's Privy profile (if provided)
        ...(email && { email_address: email }),
        // ID Document fields from id_info or Smile ID response
        id_type: id_info.id_type,
        id_number: smileIdInfo.id_number || id_info.id_number,
        id_country: id_info.country,
        // Personal info from Smile ID response
        full_name:
          smileIdInfo.full_name ||
          (smileIdInfo.first_name && smileIdInfo.last_name
            ? `${smileIdInfo.first_name} ${smileIdInfo.last_name}`
            : null),
        date_of_birth: smileIdInfo.dob || id_info.dob || null,
        platform: updatedPlatform,
        verified: true,
        verified_at: new Date().toISOString(),
        tier: newTier,
      })
      .eq("wallet_address", walletAddress)
      .select("wallet_address");

    if (supabaseError) {
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
      return NextResponse.json(
        {
          status: "error",
          message:
            "No KYC profile exists. Please complete phone verification first.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      status: "success",
      message: "KYC verification submitted and saved successfully",
      data: {
        jobId: job_id,
        userId: user_id,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
