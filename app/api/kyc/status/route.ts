import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import {
  identityScopeHasVerifiedPhone,
  resolveIdentityScope,
} from "@/app/lib/kyc-identity";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import { createKycReporter } from "@/app/lib/kyc-telemetry";

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  // Failures only. Every KYC surface polls this endpoint, so logging its
  // successes would bury the upgrade steps that matter.
  const report = createKycReporter({ step: "status" });

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
      report.failed({
        walletAddress,
        stage: "profile_fetch",
        reason: "supabase_error",
        provider: "supabase",
        providerCode: kycProfileError.code,
        detail: kycProfileError.message,
        statusCode: 500,
      });
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
    let pooledWalletCount: number;
    let scopeWallets: string[];
    try {
      const scope = await resolveIdentityScope(walletAddress);
      tier = scope.effectiveTier as 0 | 1 | 2 | 3;
      // How many wallets share this allowance. > 1 is what makes the UI explain the
      // pool; at 1 every limit surface renders exactly as it did before pooling.
      pooledWalletCount = scope.wallets.length;
      scopeWallets = scope.wallets;
    } catch (scopeError) {
      // The identity scope decides which tier and limit the UI shows, so a
      // failure here reads to the user as a lost verification.
      report.failed({
        walletAddress,
        stage: "identity_scope",
        reason: "identity_scope_failed",
        detail:
          scopeError instanceof Error ? scopeError.message : String(scopeError),
        error: scopeError,
        statusCode: 500,
      });
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

    // Identity-scoped view for gates that care about the person, not the wallet: a wallet that
    // inherited its tier through the ID triple may hold no phone itself while a sibling wallet
    // verified one. Without this flag the tier-2 phone gate loops forever (re-verifying the same
    // number is rejected as already in use). Fail-soft to the per-wallet answer — the gate then
    // behaves exactly as before.
    let identityHasVerifiedPhone = phoneVerified;
    if (!identityHasVerifiedPhone && scopeWallets.length > 1) {
      try {
        identityHasVerifiedPhone =
          await identityScopeHasVerifiedPhone(scopeWallets);
      } catch (phoneScopeError) {
        // Fail-soft: the per-wallet answer still stands, but a tier 2 user
        // whose phone lives on a sibling wallet can loop on the phone gate.
        report.failed({
          walletAddress,
          stage: "identity_phone_lookup",
          reason: "identity_phone_lookup_failed",
          detail:
            phoneScopeError instanceof Error
              ? phoneScopeError.message
              : String(phoneScopeError),
          error: phoneScopeError,
          tierFrom: tier,
        });
      }
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/kyc/status", "GET", 200, responseTime);

    return NextResponse.json({
      success: true,
      tier,
      pooledWalletCount,
      isPhoneVerified: phoneVerified,
      identityHasVerifiedPhone,
      phoneNumber,
      fullName: kycProfile?.full_name || null,
    });
  } catch (error) {
    report.failed({
      stage: "unhandled",
      reason: "unexpected_error",
      detail: error instanceof Error ? error.message : String(error),
      error,
      statusCode: 500,
    });
    trackApiError(request, '/api/kyc/status', 'GET', error as Error, 500);
    
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
