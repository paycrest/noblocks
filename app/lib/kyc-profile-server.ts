import { supabaseAdmin } from "@/app/lib/supabase";

/**
 * Result of a server-side KYC full-name lookup.
 * - `{ ok: true, fullName }` — the lookup succeeded; `fullName` is the verified name, or `null` when
 *   the user genuinely has no KYC name on file (callers skip name enforcement).
 * - `{ ok: false }` — the lookup itself failed (DB error/exception). Callers MUST fail closed
 *   (e.g. 503) rather than treat it as "no name", otherwise a transient blip disables the gate.
 */
export type KycFullNameResult =
  | { ok: true; fullName: string | null }
  | { ok: false };

/** Server-side lookup of a user's verified KYC full name from `user_kyc_profiles`. */
export async function getKycFullName(
  walletAddress: string,
): Promise<KycFullNameResult> {
  const normalized = walletAddress.trim().toLowerCase();
  if (!normalized) return { ok: true, fullName: null };

  try {
    const { data, error } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("full_name")
      .eq("wallet_address", normalized)
      .maybeSingle();

    if (error) {
      console.error("[kyc] full_name lookup failed:", error);
      return { ok: false };
    }

    const fullName =
      typeof data?.full_name === "string" ? data.full_name.trim() : "";
    return { ok: true, fullName: fullName || null };
  } catch (err) {
    console.error("[kyc] full_name lookup threw:", err);
    return { ok: false };
  }
}
