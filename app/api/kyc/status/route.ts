import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    trackApiRequest(request, "/api/kyc/status", "GET");

    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers.get("x-wallet-address");

    if (!walletAddress) {
      trackApiError(
        request,
        "/api/kyc/status",
        "GET",
        new Error("Unauthorized"),
        401,
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Check KYC profile for phone and SmileID verification status
    const { data: kycProfile, error: kycProfileError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("verified, phone_number, tier")
      .eq("wallet_address", walletAddress)
      .maybeSingle();

    if (kycProfileError) {
      trackApiError(
        request,
        "/api/kyc/status",
        "GET",
        kycProfileError as Error,
        500,
      );
      return NextResponse.json(
        { success: false, error: "Failed to load KYC profile" },
        { status: 500 },
      );
    }

    const rawTier = Number(kycProfile?.tier ?? 0);
    const safeTier = Number.isFinite(rawTier) ? rawTier : 0;
    const tier: 0 | 1 | 2 | 3 = Math.min(
      Math.max(safeTier, 0),
      3,
    ) as 0 | 1 | 2 | 3;
    const phoneNumber = kycProfile?.phone_number || null;
    // tier >= 1 means phone OTP was verified; do not rely on the generic `verified` flag
    const phoneVerified = tier >= 1 && !!phoneNumber;

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/kyc/status", "GET", 200, responseTime);

    return NextResponse.json({
      success: true,
      tier,
      isPhoneVerified: phoneVerified,
      phoneNumber,
    });
  } catch (error) {
    trackApiError(request, '/api/kyc/status', 'GET', error as Error, 500);
    
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
