import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimitAndAnalytics } from "@/app/lib/analytics-middleware";
import { requireAdmin } from "@/app/lib/fantasy/admin";
import { validateUsername } from "@/app/lib/fantasy/validation";
import { jsonError, jsonOk } from "@/app/lib/fantasy/server";

const isUniqueViolation = (error: { code?: string; message?: string } | null) =>
  error?.code === "23505" ||
  Boolean(error?.message?.toLowerCase().includes("duplicate")) ||
  Boolean(error?.message?.toLowerCase().includes("unique"));

/**
 * POST /api/play/admin/username — support rename (F-15, PRD §5.3: usernames
 * are permanent for users; support can rename abusive handles manually).
 * Body: { walletAddress, username }. Validates format/blocklist, checks
 * availability case-insensitively excluding this wallet, then writes the new
 * username onto user_kyc_profiles.
 */
export const POST = withRateLimitAndAnalytics(async (request: NextRequest) => {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => ({}));
    const walletAddress = String(body?.walletAddress ?? "")
      .trim()
      .toLowerCase();
    if (!walletAddress) {
      return jsonError("walletAddress is required", 400);
    }

    const validation = validateUsername(String(body?.username ?? ""));
    if (!validation.ok) {
      return jsonError(validation.error, 400, { code: "INVALID_USERNAME" });
    }
    const username = validation.normalized;

    // Case-insensitive availability check, excluding this wallet so renaming
    // to a different casing of the current handle still works.
    const { data: existing, error: checkError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("wallet_address")
      // Escape LIKE wildcards — usernames may legitimately contain "_".
      .ilike("username", username.replace(/[\\%_]/g, "\\$&"))
      .neq("wallet_address", walletAddress)
      .limit(1);
    if (checkError) throw checkError;
    if ((existing?.length ?? 0) > 0) {
      return jsonError("That username is already taken", 409, {
        code: "USERNAME_TAKEN",
      });
    }

    // Upsert (same pattern as /api/play/join) so admins can also set a handle
    // for a wallet whose profile row doesn't exist yet.
    const { error: upsertError } = await supabaseAdmin
      .from("user_kyc_profiles")
      .upsert(
        { wallet_address: walletAddress, username },
        { onConflict: "wallet_address" },
      );
    if (upsertError) {
      if (isUniqueViolation(upsertError)) {
        return jsonError("That username was just taken", 409, {
          code: "USERNAME_TAKEN",
        });
      }
      throw upsertError;
    }

    return jsonOk({ wallet_address: walletAddress, username });
  } catch (error) {
    console.error("[play admin] username update failed:", error);
    return jsonError("Failed to update username", 500);
  }
});
