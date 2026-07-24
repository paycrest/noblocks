import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import { getKycFullName } from "@/app/lib/kyc-profile-server";
import {
  accountNameMatchesKyc,
  REFUND_NAME_MISMATCH_MESSAGE,
} from "@/app/lib/name-matching";

type RefundAccountBody = {
  institution?: string;
  institutionCode?: string;
  accountIdentifier?: string;
  accountName?: string;
};

export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  try {
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(
        request,
        "/api/v1/refund-account",
        "GET",
        new Error("Unauthorized"),
        401,
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    trackApiRequest(request, "/api/v1/refund-account", "GET", {
      wallet_address: walletAddress,
    });

    const { data, error } = await supabaseAdmin
      .from("refund_accounts")
      .select("*")
      .eq("normalized_wallet_address", walletAddress)
      .maybeSingle();

    if (error) {
      console.error("Supabase refund_accounts GET:", error);
      throw error;
    }

    if (!data) {
      trackApiResponse("/api/v1/refund-account", "GET", 200, Date.now() - startTime, {
        wallet_address: walletAddress,
        found: false,
      });
      return NextResponse.json({ success: true, data: null });
    }

    trackApiResponse("/api/v1/refund-account", "GET", 200, Date.now() - startTime, {
      wallet_address: walletAddress,
      found: true,
    });

    return NextResponse.json({
      success: true,
      data: {
        institutionCode: data.institution_code,
        institutionName: data.institution,
        accountName: data.account_name,
        accountNumber: data.account_identifier,
      },
    });
  } catch (error) {
    console.error("Error fetching refund account:", error);
    trackApiError(request, "/api/v1/refund-account", "GET", error as Error, 500);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

export const PUT = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  try {
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(
        request,
        "/api/v1/refund-account",
        "PUT",
        new Error("Unauthorized"),
        401,
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as RefundAccountBody;
    const institution = String(body.institution ?? "").trim();
    const institutionCode = String(body.institutionCode ?? "").trim();
    const accountIdentifier = String(body.accountIdentifier ?? "").trim();
    const accountName = String(body.accountName ?? "").trim();

    if (!institution || !institutionCode || !accountIdentifier || !accountName) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields: institution, institutionCode, accountIdentifier, accountName",
        },
        { status: 400 },
      );
    }

    // Refund-account name policy: the account must belong to the same person as the verified KYC
    // profile. Enforced here for early feedback; the onramp order-creation gate re-checks at money
    // time (so an account saved before KYC is still validated then). When no KYC name is on file
    // yet, there's nothing to match against — allow the save. A KYC lookup failure fails closed.
    const kyc = await getKycFullName(walletAddress);
    if (!kyc.ok) {
      trackApiError(
        request,
        "/api/v1/refund-account",
        "PUT",
        new Error("KYC name lookup failed"),
        503,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Could not verify your identity right now. Please try again.",
        },
        { status: 503 },
      );
    }
    if (kyc.fullName && !accountNameMatchesKyc(kyc.fullName, accountName)) {
      trackApiError(
        request,
        "/api/v1/refund-account",
        "PUT",
        new Error("Refund account name does not match KYC profile"),
        422,
      );
      return NextResponse.json(
        { success: false, error: REFUND_NAME_MISMATCH_MESSAGE },
        { status: 422 },
      );
    }

    trackApiRequest(request, "/api/v1/refund-account", "PUT", {
      wallet_address: walletAddress,
    });

    const { data, error } = await supabaseAdmin
      .from("refund_accounts")
      .upsert(
        {
          wallet_address: walletAddress,
          normalized_wallet_address: walletAddress,
          institution,
          institution_code: institutionCode,
          account_identifier: accountIdentifier,
          account_name: accountName,
        },
        { onConflict: "normalized_wallet_address" },
      )
      .select()
      .single();

    if (error) {
      console.error("Supabase refund_accounts upsert:", error);
      throw error;
    }

    trackApiResponse("/api/v1/refund-account", "PUT", 200, Date.now() - startTime, {
      wallet_address: walletAddress,
    });

    return NextResponse.json({
      success: true,
      data: {
        institutionCode: data.institution_code,
        institutionName: data.institution,
        accountName: data.account_name,
        accountNumber: data.account_identifier,
      },
    });
  } catch (error) {
    console.error("Error saving refund account:", error);
    trackApiError(request, "/api/v1/refund-account", "PUT", error as Error, 500);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
