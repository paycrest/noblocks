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
 * POST /api/tron/create-wallet
 * Creates a new Tron wallet for the user via Privy.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      trackApiError(
        request,
        "/api/tron/create-wallet",
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
        "/api/tron/create-wallet",
        "POST",
        new Error("Invalid token: missing user ID"),
        401,
      );
      return NextResponse.json(
        { error: "Invalid token: missing user ID" },
        { status: 401 },
      );
    }

    trackApiRequest(request, "/api/tron/create-wallet", "POST", {
      privy_user_id: authUserId,
    });

    const privy = getPrivyClient();

    try {
      const user = await privy.getUser(authUserId);
      const linkedAccounts = user.linkedAccounts || [];
      const existingTronWallet = linkedAccounts.find(
        (account: {
          type?: string;
          chainType?: string;
          chain_type?: string;
        }) =>
          account.type === "wallet" &&
          (account.chainType === "tron" || account.chain_type === "tron"),
      );

      if (existingTronWallet) {
        const wallet = existingTronWallet as {
          id?: string;
          address?: string;
          chainType?: string;
          chain_type?: string;
        };
        const responseTime = Date.now() - startTime;
        trackApiResponse("/api/tron/create-wallet", "POST", 200, responseTime, {
          privy_user_id: authUserId,
          existing_wallet: true,
        });
        return NextResponse.json({
          success: true,
          wallet: {
            id: wallet.id,
            address: wallet.address,
            chainType: wallet.chainType || wallet.chain_type,
          },
        });
      }
    } catch (error) {
      console.error("Error checking for existing Tron wallet:", error);
      throw error;
    }

    const wallet = await privy.walletApi.createWallet({
      chainType: "tron",
      owner: { userId: authUserId },
    } as Parameters<typeof privy.walletApi.createWallet>[0]);

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/tron/create-wallet", "POST", 200, responseTime, {
      privy_user_id: authUserId,
      existing_wallet: false,
    });

    const created = wallet as {
      id?: string;
      address?: string;
      chainType?: string;
      chain_type?: string;
    };

    return NextResponse.json({
      success: true,
      wallet: {
        id: created.id,
        address: created.address,
        chainType: created.chainType || created.chain_type,
      },
    });
  } catch (error: unknown) {
    console.error("Error creating Tron wallet:", error);
    const responseTime = Date.now() - startTime;
    const err =
      error instanceof Error ? error : new Error("Failed to create Tron wallet");
    trackApiError(request, "/api/tron/create-wallet", "POST", err, 500, {
      response_time_ms: responseTime,
    });
    return NextResponse.json(
      { error: err.message || "Failed to create Tron wallet" },
      { status: 500 },
    );
  }
});
