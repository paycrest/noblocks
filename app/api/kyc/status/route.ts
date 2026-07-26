import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveIdentityScope } from "@/app/lib/kyc-identity";
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
      .select("verified, phone_number, tier, full_name")
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

    // The identity carries the tier: a wallet inherits the highest tier reached by any
    // wallet sharing its verified phone/ID, so verifying an ID once lifts every wallet
    // that person holds. Reported here so the UI shows the tier and cap that
    // enforcement will actually apply.
    let tier: 0 | 1 | 2 | 3;
    try {
      tier = (await resolveIdentityScope(walletAddress)).effectiveTier as
        | 0
        | 1
        | 2
        | 3;
    } catch (scopeError) {
      trackApiError(request, "/api/kyc/status", "GET", scopeError as Error, 500);
      return NextResponse.json(
        { success: false, error: "Failed to load KYC profile" },
        { status: 500 },
      );
    }

    const phoneNumber = kycProfile?.phone_number || null;
    // tier >= 1 means phone OTP was verified; do not rely on the generic `verified` flag.
    // phone_number stays this wallet's own, so an inherited tier can never report a
    // phone as verified on a wallet that never verified one.
    const phoneVerified = tier >= 1 && !!phoneNumber;

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/kyc/status", "GET", 200, responseTime);

    return NextResponse.json({
      success: true,
      tier,
      isPhoneVerified: phoneVerified,
      phoneNumber,
      fullName: kycProfile?.full_name || null,
    });
  } catch (error) {
    trackApiError(request, '/api/kyc/status', 'GET', error as Error, 500);
    
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
