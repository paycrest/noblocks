import { supabaseAdmin } from "@/app/lib/supabase";
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
import { normalizeRefundAccountCurrency } from "@/app/utils";
import { resolveInstitutionForCurrency } from "@/app/lib/refund-account-institutions";

type RefundAccountBody = {
  currency?: string;
  institution?: string;
  institutionCode?: string;
  accountIdentifier?: string;
  accountName?: string;
};

export type RefundAccountApiResult = {
  status: number;
  body: Record<string, unknown>;
};

/** Minimal request surface used by refund-account handlers (avoids NextRequest in tests). */
export type RefundAccountRequest = {
  headers: { get(name: string): string | null };
  nextUrl?: { searchParams: { get(name: string): string | null } };
  json?: () => Promise<unknown>;
};

const INVALID_CURRENCY_BODY = {
  success: false,
  error: "Missing or invalid currency. Provide a supported onramp fiat code.",
};

function mapRow(data: {
  currency: string;
  institution_code: string;
  institution: string;
  account_name: string;
  account_identifier: string;
}) {
  return {
    currency: data.currency,
    institutionCode: data.institution_code,
    institutionName: data.institution,
    accountName: data.account_name,
    accountNumber: data.account_identifier,
  };
}

export async function handleGetRefundAccount(
  request: RefundAccountRequest,
): Promise<RefundAccountApiResult> {
  const startTime = Date.now();
  try {
    const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

    if (!walletAddress) {
      trackApiError(
        request as never,
        "/api/v1/refund-account",
        "GET",
        new Error("Unauthorized"),
        401,
      );
      return { status: 401, body: { success: false, error: "Unauthorized" } };
    }

    const currency = normalizeRefundAccountCurrency(
      request.nextUrl?.searchParams.get("currency") ?? null,
    );
    if (!currency) {
      return { status: 400, body: INVALID_CURRENCY_BODY };
    }

    trackApiRequest(request as never, "/api/v1/refund-account", "GET", {
      wallet_address: walletAddress,
      currency,
    });

    const { data, error } = await supabaseAdmin
      .from("refund_accounts")
      .select("*")
      .eq("normalized_wallet_address", walletAddress)
      .eq("currency", currency)
      .maybeSingle();

    if (error) {
      console.error("Supabase refund_accounts GET:", error);
      throw error;
    }

    if (!data) {
      trackApiResponse("/api/v1/refund-account", "GET", 200, Date.now() - startTime, {
        wallet_address: walletAddress,
        currency,
        found: false,
      });
      return { status: 200, body: { success: true, data: null } };
    }

    trackApiResponse("/api/v1/refund-account", "GET", 200, Date.now() - startTime, {
      wallet_address: walletAddress,
      currency,
      found: true,
    });

    return { status: 200, body: { success: true, data: mapRow(data) } };
  } catch (error) {
    console.error("Error fetching refund account:", error);
    trackApiError(
      request as never,
      "/api/v1/refund-account",
      "GET",
      error as Error,
      500,
    );
    return {
      status: 500,
      body: { success: false, error: "Internal server error" },
    };
  }
}

export async function handlePutRefundAccount(
  request: RefundAccountRequest,
): Promise<RefundAccountApiResult> {
  const startTime = Date.now();
  try {
    const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();

    if (!walletAddress) {
      trackApiError(
        request as never,
        "/api/v1/refund-account",
        "PUT",
        new Error("Unauthorized"),
        401,
      );
      return { status: 401, body: { success: false, error: "Unauthorized" } };
    }

    const body = (await request.json?.()) as RefundAccountBody;
    const currency = normalizeRefundAccountCurrency(body?.currency);
    if (!currency) {
      return { status: 400, body: INVALID_CURRENCY_BODY };
    }

    const institutionCode = String(body.institutionCode ?? "").trim();
    const accountIdentifier = String(body.accountIdentifier ?? "").trim();
    const accountName = String(body.accountName ?? "").trim();
    // Client-supplied name is accepted only for the required-fields check; the stored name comes
    // from the aggregator institution list so a crafted PUT cannot spoof labels.
    const clientInstitutionName = String(body.institution ?? "").trim();

    if (
      !clientInstitutionName ||
      !institutionCode ||
      !accountIdentifier ||
      !accountName
    ) {
      return {
        status: 400,
        body: {
          success: false,
          error:
            "Missing required fields: currency, institution, institutionCode, accountIdentifier, accountName",
        },
      };
    }

    const institutionCheck = await resolveInstitutionForCurrency(
      currency,
      institutionCode,
    );
    if (!institutionCheck.ok) {
      trackApiError(
        request as never,
        "/api/v1/refund-account",
        "PUT",
        new Error(institutionCheck.error),
        institutionCheck.status,
      );
      return {
        status: institutionCheck.status,
        body: { success: false, error: institutionCheck.error },
      };
    }
    const institution = institutionCheck.institution.name;

    // Refund-account name policy: the account must belong to the same person as the verified KYC
    // profile. Enforced here for early feedback; the onramp order-creation gate re-checks at money
    // time (so an account saved before KYC is still validated then). When no KYC name is on file
    // yet, there's nothing to match against — allow the save. A KYC lookup failure fails closed.
    const kyc = await getKycFullName(walletAddress);
    if (!kyc.ok) {
      trackApiError(
        request as never,
        "/api/v1/refund-account",
        "PUT",
        new Error("KYC name lookup failed"),
        503,
      );
      return {
        status: 503,
        body: {
          success: false,
          error: "Could not verify your identity right now. Please try again.",
        },
      };
    }
    if (kyc.fullName && !accountNameMatchesKyc(kyc.fullName, accountName)) {
      trackApiError(
        request as never,
        "/api/v1/refund-account",
        "PUT",
        new Error("Refund account name does not match KYC profile"),
        422,
      );
      return {
        status: 422,
        body: { success: false, error: REFUND_NAME_MISMATCH_MESSAGE },
      };
    }

    trackApiRequest(request as never, "/api/v1/refund-account", "PUT", {
      wallet_address: walletAddress,
      currency,
    });

    const { data, error } = await supabaseAdmin
      .from("refund_accounts")
      .upsert(
        {
          wallet_address: walletAddress,
          normalized_wallet_address: walletAddress,
          currency,
          institution,
          institution_code: institutionCode,
          account_identifier: accountIdentifier,
          account_name: accountName,
        },
        { onConflict: "normalized_wallet_address,currency" },
      )
      .select()
      .single();

    if (error) {
      console.error("Supabase refund_accounts upsert:", error);
      throw error;
    }

    trackApiResponse("/api/v1/refund-account", "PUT", 200, Date.now() - startTime, {
      wallet_address: walletAddress,
      currency,
    });

    return { status: 200, body: { success: true, data: mapRow(data) } };
  } catch (error) {
    console.error("Error saving refund account:", error);
    trackApiError(
      request as never,
      "/api/v1/refund-account",
      "PUT",
      error as Error,
      500,
    );
    return {
      status: 500,
      body: { success: false, error: "Internal server error" },
    };
  }
}
