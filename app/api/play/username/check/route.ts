import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { validateUsername, suggestUsernames } from "@/app/lib/fantasy/validation";
import {
  fantasyDisabledResponse,
  getAuthedWallet,
  isFantasyEnabled,
  jsonError,
  jsonOk,
} from "@/app/lib/fantasy/server";

/** GET /api/play/username/check?u=<candidate> — availability + suggestions. */
export const GET = withRateLimit(async (request: NextRequest) => {
  if (!isFantasyEnabled()) return fantasyDisabledResponse();

  const auth = await getAuthedWallet(request);
  if (!auth) return jsonError("Unauthorized", 401);

  const candidate = request.nextUrl.searchParams.get("u") ?? "";
  const validation = validateUsername(candidate);
  if (!validation.ok) {
    return jsonOk({ available: false, reason: validation.error });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("wallet_address")
      // Escape LIKE wildcards — usernames may legitimately contain "_".
      .ilike("username", validation.normalized.replace(/[\\%_]/g, "\\$&"))
      .limit(1);
    if (error) throw error;

    const taken =
      (data?.length ?? 0) > 0 && data![0].wallet_address !== auth.walletAddress;

    return jsonOk({
      available: !taken,
      ...(taken ? { suggestions: suggestUsernames(validation.normalized) } : {}),
    });
  } catch (error) {
    console.error("[play] username check failed:", error);
    return jsonError("Failed to check username", 500);
  }
});
