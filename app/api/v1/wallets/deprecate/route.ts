import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { trackApiRequest, trackApiResponse, trackApiError } from "@/app/lib/server-analytics";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Step 1: Verify authentication token
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      trackApiError(request, "/api/v1/wallets/deprecate", "POST", new Error("Unauthorized"), 401);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    let authenticatedUserId: string;
    try {
      const jwtResult = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
      authenticatedUserId = jwtResult.payload.sub;

      if (!authenticatedUserId) {
        trackApiError(request, "/api/v1/wallets/deprecate", "POST", new Error("Invalid token"), 401);
        return NextResponse.json(
          { success: false, error: "Invalid token" },
          { status: 401 }
        );
      }
    } catch (jwtError) {
      trackApiError(request, "/api/v1/wallets/deprecate", "POST", jwtError as Error, 401);
      return NextResponse.json(
        { success: false, error: "Invalid or expired token" },
        { status: 401 }
      );
    }

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

    // Step 2: Verify userId matches authenticated user (CRITICAL SECURITY FIX)
    if (userId !== authenticatedUserId) {
      trackApiError(request, "/api/v1/wallets/deprecate", "POST", new Error("Unauthorized: userId mismatch"), 403);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Step 3: Verify wallet addresses match
    if (newAddress.toLowerCase() !== walletAddress) {
      trackApiError(request, "/api/v1/wallets/deprecate", "POST", new Error("Wallet address mismatch"), 403);
      return NextResponse.json(
        { success: false, error: "Wallet address mismatch" },
        { status: 403 }
      );
    }

    trackApiRequest(request, "/api/v1/wallets/deprecate", "POST", {
      wallet_address: walletAddress,
      old_address: oldAddress,
      new_address: newAddress,
    });

    // Step 4: Atomic database operations with rollback on failure
    // Ensure old (SCW) wallet exists and mark as deprecated (upsert so we insert if never saved to DB)
    const now = new Date().toISOString();
    const { error: deprecateError } = await supabaseAdmin
      .from("wallets")
      .upsert(
        {
          address: oldAddress.toLowerCase(),
          user_id: userId,
          wallet_type: "smart_contract",
          status: "deprecated",
          deprecated_at: now,
          migration_completed: true,
          migration_tx_hash: txHash,
          updated_at: now,
        },
        { onConflict: "address,user_id" }
      );

    if (deprecateError) {
      trackApiError(request, "/api/v1/wallets/deprecate", "POST", deprecateError, 500);
      throw deprecateError;
    }

    // Create or update new EOA wallet record
    const { error: upsertError } = await supabaseAdmin
      .from("wallets")
      .upsert({
        address: newAddress.toLowerCase(),
        user_id: userId,
        wallet_type: "eoa",
        status: "active",
        created_at: new Date().toISOString(),
      });

    if (upsertError) {
      // Rollback: Restore old wallet status
      await supabaseAdmin
        .from("wallets")
        .update({
          status: "active",
          deprecated_at: null,
          migration_completed: false,
          migration_tx_hash: null,
        })
        .eq("address", oldAddress.toLowerCase())
        .eq("user_id", userId);

      trackApiError(request, "/api/v1/wallets/deprecate", "POST", upsertError, 500);
      throw upsertError;
    }

    // Migrate KYC data
    const { error: kycError } = await supabaseAdmin
      .from("kyc_data")
      .update({ wallet_address: newAddress.toLowerCase() })
      .eq("wallet_address", oldAddress.toLowerCase())
      .eq("user_id", userId);

    if (kycError) {
      console.error("KYC migration error:", kycError);
      // Return partial success - wallet migrated but KYC migration failed
      // This is better than rolling back the entire migration
      const responseTime = Date.now() - startTime;
      trackApiResponse("/api/v1/wallets/deprecate", "POST", 200, responseTime, {
        wallet_address: walletAddress,
        migration_successful: true,
        kyc_migration_failed: true,
      });

      return NextResponse.json({
        success: true,
        message: "Wallet migrated but KYC migration failed",
        kycMigrationFailed: true,
      });
    }

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