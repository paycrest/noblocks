import { NextRequest, NextResponse } from "next/server";
import { trackApiError, trackApiRequest, trackApiResponse } from "@/app/lib/server-analytics";
import { supabaseAdmin } from "@/app/lib/supabase";
import { submitSmileIDJob } from "@/app/lib/smileID";
import { extractSmileIdIdentity } from "@/app/lib/smileIdIdentity";
import { resolveIdentityScope } from "@/app/lib/kyc-identity";
import { accountNameMatchesKyc } from "@/app/lib/name-matching";

/**
 * On-ramp identity check (KAN-870): an ID-verified user confirms their BVN or NIN, which an NGN
 * on-ramp must carry. Smile ID's ID-number lookup (Enhanced KYC, job type 5, no selfie) returns
 * the record's name, date of birth and phone; the number is accepted only when that record is
 * this user's: its phone matches their OTP-verified phone, or its name matches their verified
 * name. The BVN or NIN is then stored beside their verified document, with the date of birth
 * when none is stored and the record's name when it differs. Nothing identifying is returned.
 */

const ELEVEN_DIGITS = /^\d{11}$/;
const ROUTE = "/api/kyc/identity-check";

/** The last ten digits of a Nigerian number, so 0803…, 234803… and +234 803… compare equal. */
function nigerianPhoneKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function fail(request: NextRequest, status: number, code: string, error: string) {
  trackApiError(request, ROUTE, "POST", new Error(code), status);
  return NextResponse.json({ success: false, code, error }, { status });
}

export async function handleOnrampIdentityCheck(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();
  if (!walletAddress) return fail(request, 401, "unauthorized", "Unauthorized");
  trackApiRequest(request, ROUTE, "POST", { wallet_address: walletAddress });

  let body: { idType?: unknown; idNumber?: unknown };
  try {
    body = (await request.json()) as { idType?: unknown; idNumber?: unknown };
  } catch {
    return fail(request, 400, "invalid_body", "Invalid request.");
  }
  const idType = body.idType === "BVN" || body.idType === "NIN" ? body.idType : null;
  const idNumber = typeof body.idNumber === "string" ? body.idNumber.replace(/\s+/g, "") : "";
  if (!idType || !ELEVEN_DIGITS.test(idNumber)) {
    return fail(request, 400, "invalid_id", "Enter your 11-digit BVN or NIN.");
  }
  const column = idType === "BVN" ? "bvn" : "nin";

  let scope;
  let profile: { tier: number | null; full_name: string | null; date_of_birth: string | null; phone_number: string | null } | null;
  try {
    scope = await resolveIdentityScope(walletAddress);
    const { data, error } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("tier, full_name, date_of_birth, phone_number")
      .eq("wallet_address", walletAddress)
      .maybeSingle();
    if (error) throw error;
    profile = data;
  } catch {
    return fail(request, 503, "kyc_db_error", "Could not check your identity right now. Please try again.");
  }
  if (!profile || scope.effectiveTier < 2) {
    return fail(request, 403, "id_verification_required", "Verify your identity with a government ID first.");
  }

  // The number must not already belong to someone else: another verified wallet outside this
  // person's identity, holding it in the same column or as its verified document.
  const docTypes = idType === "BVN" ? ["BVN"] : ["NIN", "NIN_SLIP", "NIN_V2"];
  const [byColumn, byDocument] = await Promise.all([
    supabaseAdmin.from("user_kyc_profiles").select("wallet_address").eq(column, idNumber).gte("tier", 2),
    supabaseAdmin
      .from("user_kyc_profiles")
      .select("wallet_address")
      .eq("id_number", idNumber)
      .in("id_type", docTypes)
      .gte("tier", 2),
  ]);
  if (byColumn.error || byDocument.error) {
    return fail(request, 503, "kyc_db_error", "Could not check your identity right now. Please try again.");
  }
  const holders = [...(byColumn.data ?? []), ...(byDocument.data ?? [])]
    .map((r) => String(r.wallet_address ?? "").toLowerCase())
    .filter((w) => w && !scope.wallets.includes(w));
  if (holders.length > 0) {
    return fail(request, 409, "id_in_use", "This number is already linked to another Noblocks account.");
  }

  let result: unknown;
  try {
    const submitted = await submitSmileIDJob({
      images: [],
      partner_params: {},
      walletAddress,
      id_info: { country: "NG", id_type: idType === "BVN" ? "BVN" : "NIN_SLIP", id_number: idNumber },
    });
    result = submitted.smileIdResult;
  } catch {
    return fail(request, 502, "provider_error", "We couldn't reach our verification partner. Please try again.");
  }

  const r = (result ?? {}) as { Actions?: { Verify_ID_Number?: string }; PhoneNumber?: unknown; PhoneNumber2?: unknown };
  if (r.Actions?.Verify_ID_Number !== "Verified") {
    return fail(request, 422, "id_not_verified", `We couldn't verify this ${idType}. Check the number and try again.`);
  }
  const identity = extractSmileIdIdentity(result);

  const ownPhone = nigerianPhoneKey(profile.phone_number);
  const phoneMatches =
    !!ownPhone && [r.PhoneNumber, r.PhoneNumber2].some((p) => nigerianPhoneKey(p) === ownPhone);
  const nameMatches =
    !!identity.fullName && !!profile.full_name && accountNameMatchesKyc(identity.fullName, profile.full_name);
  if (!phoneMatches && !nameMatches) {
    return fail(
      request,
      403,
      "identity_mismatch",
      `This ${idType} doesn't match your verified details. Use your own ${idType}, or verify your identity again.`,
    );
  }

  // Store the number; fill the birth date only when none is stored; adopt the record's name when
  // it is in Latin letters and differs. Each write is conditional on what was read.
  const writes: PromiseLike<{ error: { code?: string } | null }>[] = [
    supabaseAdmin.from("user_kyc_profiles").update({ [column]: idNumber }).eq("wallet_address", walletAddress),
  ];
  if (identity.dateOfBirth && !profile.date_of_birth) {
    writes.push(
      supabaseAdmin
        .from("user_kyc_profiles")
        .update({ date_of_birth: identity.dateOfBirth })
        .eq("wallet_address", walletAddress)
        .is("date_of_birth", null),
    );
  }
  if (identity.fullName && /[A-Za-z]/.test(identity.fullName) && identity.fullName !== profile.full_name) {
    const nameWrite = supabaseAdmin
      .from("user_kyc_profiles")
      .update({ full_name: identity.fullName })
      .eq("wallet_address", walletAddress);
    writes.push(profile.full_name ? nameWrite.eq("full_name", profile.full_name) : nameWrite.is("full_name", null));
  }
  const results = await Promise.all(writes);
  if (results.some((w) => w.error)) {
    return fail(request, 503, "kyc_db_error", "Could not save your details. Please try again.");
  }

  trackApiResponse(ROUTE, "POST", 200, Date.now() - startTime, { wallet_address: walletAddress });
  return NextResponse.json({ success: true });
}
