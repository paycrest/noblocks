import { NextRequest, NextResponse } from "next/server";
import { getPrivyClient } from "@/app/lib/privy";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";


/**
 * POST /api/starknet/create-wallet
 * Creates a new Starknet wallet for the user via Privy
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      trackApiError(
        request,
        "/api/starknet/create-wallet",
        "POST",
        new Error("Missing or invalid authorization header"),
        401,
      );
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.substring(7);
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    const authUserId = payload.sub || payload.userId;

    if (!authUserId) {
      trackApiError(
        request,
        "/api/starknet/create-wallet",
        "POST",
        new Error("Invalid token: missing user ID"),
        401,
      );
      return NextResponse.json(
        { error: "Invalid token: missing user ID" },
        { status: 401 },
      );
    }

    const userId = authUserId;

    if (!userId) {
      trackApiError(request, "/api/starknet/create-wallet", "POST", new Error("No user ID available"), 400);
      return NextResponse.json({ error: "No user ID available" }, { status: 400 });
    }

    trackApiRequest(request, "/api/starknet/create-wallet", "POST", { privy_user_id: userId });

    const privy = getPrivyClient();

    let existingStarknetWallet = null;
    try {
      const user = await privy.getUser(userId);
      const linkedAccounts = user.linkedAccounts || [];
      existingStarknetWallet = linkedAccounts.find(
        (account: any) =>
          account.type === "wallet" &&
          (account.chainType === "starknet" || account.chain_type === "starknet"),
      );

      if (existingStarknetWallet) {
        const wallet = existingStarknetWallet as any;
        const responseTime = Date.now() - startTime;
        trackApiResponse("/api/starknet/create-wallet", "POST", 200, responseTime, {
          privy_user_id: userId,
          existing_wallet: true,
        });
        return NextResponse.json({
          success: true,
          wallet: {
            id: wallet.id,
            address: wallet.address,
            publicKey: wallet.public_key || wallet.publicKey,
            chainType: wallet.chainType || wallet.chain_type,
          },
        });
      }
    } catch (error) {
      console.error("Error checking for existing Starknet wallet:", error);
      throw error;
    }

    const walletPayload = {
      chainType: "starknet",
      owner: { userId },
    } as any;

    const wallet = await privy.walletApi.createWallet(walletPayload);

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/starknet/create-wallet", "POST", 200, responseTime, {
      privy_user_id: userId,
      existing_wallet: false,
    });

    return NextResponse.json({
      success: true,
      wallet: {
        id: wallet.id,
        address: wallet.address,
        publicKey: (wallet as any).public_key || (wallet as any).publicKey,
        chainType: (wallet as any).chainType || (wallet as any).chain_type,
      },
    });
  } catch (error: unknown) {
    console.error("Error creating Starknet wallet:", error);
    const responseTime = Date.now() - startTime;
    const err =
      error instanceof Error ? error : new Error("Failed to create Starknet wallet");
    trackApiError(request, "/api/starknet/create-wallet", "POST", err, 500, {
      response_time_ms: responseTime,
    });
    return NextResponse.json(
      { error: err.message || "Failed to create Starknet wallet" },
      { status: 500 },
    );
  }
});
