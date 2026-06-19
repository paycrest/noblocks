import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import { getPrivyClient } from "@/app/lib/privy";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";

/**
 * POST /api/starknet/get-public-key
 * Fetches the public key for a Starknet wallet from Privy
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      trackApiError(
        request,
        "/api/starknet/get-public-key",
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
        "/api/starknet/get-public-key",
        "POST",
        new Error("Invalid token: missing user ID"),
        401,
      );
      return NextResponse.json(
        { error: "Invalid token: missing user ID" },
        { status: 401 },
      );
    }

    trackApiRequest(request, "/api/starknet/get-public-key", "POST", { privy_user_id: authUserId });

    const body = await request.json();
    const { walletId } = body;

    if (!walletId) {
      trackApiError(request, "/api/starknet/get-public-key", "POST", new Error("walletId is required"), 400);
      return NextResponse.json({ error: "walletId is required" }, { status: 400 });
    }

    const privy = getPrivyClient();
    const wallet: any = await privy.walletApi.getWallet({ id: walletId });

    const user = await privy.getUser(authUserId);
    const linkedAccounts = user.linkedAccounts || [];
    const ownsWallet = linkedAccounts.find(
      (account: any) => account.id === walletId && account.type === "wallet",
    );

    if (!ownsWallet) {
      trackApiError(
        request,
        "/api/starknet/get-public-key",
        "POST",
        new Error("Unauthorized: wallet does not belong to this user"),
        403,
      );
      return NextResponse.json(
        { error: "Unauthorized: wallet does not belong to this user" },
        { status: 403 },
      );
    }

    const publicKey = wallet.public_key || wallet.publicKey;

    if (!publicKey) {
      trackApiError(
        request,
        "/api/starknet/get-public-key",
        "POST",
        new Error("Public key not available from Privy"),
        404,
      );
      return NextResponse.json(
        {
          error:
            "Public key not available from Privy. " +
            "This may require enabling Starknet support in your Privy dashboard or " +
            "upgrading to a Privy tier that supports Starknet public key access.",
        },
        { status: 404 },
      );
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/starknet/get-public-key", "POST", 200, responseTime, {
      privy_user_id: authUserId,
    });

    return NextResponse.json({
      success: true,
      publicKey: publicKey,
    });
  } catch (error: unknown) {
    console.error("[starknet/get-public-key]", error);
    const responseTime = Date.now() - startTime;
    const err =
      error instanceof Error ? error : new Error("Failed to fetch public key");
    trackApiError(request, "/api/starknet/get-public-key", "POST", err, 500, {
      response_time_ms: responseTime,
    });
    return NextResponse.json(
      { error: err.message || "Failed to fetch public key" },
      { status: 500 },
    );
  }
});
