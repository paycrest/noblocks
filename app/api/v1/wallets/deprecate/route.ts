import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { trackApiRequest, trackApiResponse, trackApiError } from "@/app/lib/server-analytics";

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();
    const body = await request.json();
    const { oldAddress, newAddress, txHash, userId } = body;

    if (!walletAddress || !oldAddress || !newAddress || !userId) {
      trackApiError(request, "/api/v1/wallets/deprecate", "POST", new Error("Missing required fields"), 400);
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    trackApiRequest(request, "/api/v1/wallets/deprecate", "POST", {
      wallet_address: walletAddress,
      old_address: oldAddress,
      new_address: newAddress,
    });

    // 1. Mark old wallet as deprecated
    const { error: deprecateError } = await supabaseAdmin
      .from("wallets")
      .update({
        status: "deprecated",
        deprecated_at: new Date().toISOString(),
        migration_completed: true,
        migration_tx_hash: txHash,
      })
      .eq("address", oldAddress.toLowerCase())
      .eq("user_id", userId);

    if (deprecateError) throw deprecateError;

    // 2. Create or update new EOA wallet record
    const { error: upsertError } = await supabaseAdmin
      .from("wallets")
      .upsert({
        address: newAddress.toLowerCase(),
        user_id: userId,
        wallet_type: "eoa",
        status: "active",
        created_at: new Date().toISOString(),
      });

    if (upsertError) throw upsertError;

    // 3. Migrate KYC data
    const { error: kycError } = await supabaseAdmin
      .from("kyc_data")
      .update({ wallet_address: newAddress.toLowerCase() })
      .eq("wallet_address", oldAddress.toLowerCase())
      .eq("user_id", userId);

    if (kycError) console.error("KYC migration error:", kycError);

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/v1/wallets/deprecate", "POST", 200, responseTime, {
      wallet_address: walletAddress,
      migration_successful: true,
    });

    return NextResponse.json({ success: true, message: "Wallet migrated successfully" });
  } catch (error) {
    console.error("Error deprecating wallet:", error);
    const responseTime = Date.now() - startTime;
    trackApiError(request, "/api/v1/wallets/deprecate", "POST", error as Error, 500, {
      response_time_ms: responseTime,
    });

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
});