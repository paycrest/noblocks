import { supabaseAdmin } from "@/app/lib/supabase";

/**
 * Server-side lookup of a user's verified KYC full name from `user_kyc_profiles`.
 *
 * Returns the trimmed full name, or `null` when there is no verified name on file OR the lookup
 * fails. Callers enforcing the refund-account name policy must treat `null` as "no name to match
 * against" and skip enforcement (don't fail closed on a transient DB error — the policy is layered
 * across the save step and order creation).
 */
export async function getKycFullName(
  walletAddress: string,
): Promise<string | null> {
  const normalized = walletAddress.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("full_name")
      .eq("wallet_address", normalized)
      .maybeSingle();

    if (error) {
      console.error("[kyc] full_name lookup failed:", error);
      return null;
    }

    const fullName =
      typeof data?.full_name === "string" ? data.full_name.trim() : "";
    return fullName || null;
  } catch (err) {
    console.error("[kyc] full_name lookup threw:", err);
    return null;
  }
}
