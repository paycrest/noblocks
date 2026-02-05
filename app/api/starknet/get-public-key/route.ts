import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import { getPrivyClient } from "@/app/lib/privy";

/**
 * POST /api/starknet/get-public-key
 * Fetches the public key for a Starknet wallet from Privy
 */
export async function POST(request: NextRequest) {
  try {
    // Extract and verify JWT token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    const authUserId = payload.sub || payload.userId;

    if (!authUserId) {
      return NextResponse.json(
        { error: "Invalid token: missing user ID" },
        { status: 401 }
      );
    }

    // Get request body
    const body = await request.json();
    const { walletId } = body;

    if (!walletId) {
      return NextResponse.json(
        { error: "walletId is required" },
        { status: 400 }
      );
    }

    const privy = getPrivyClient();
    const wallet: any = await privy.walletApi.getWallet({ id: walletId });
    
    // Verify that the wallet belongs to the authenticated user
    const user = await privy.getUser(authUserId);
    const linkedAccounts = user.linkedAccounts || [];
    const ownsWallet = linkedAccounts.find(
      (account: any) => account.id === walletId && account.type === "wallet"
    );
    
    if (!ownsWallet) {
      return NextResponse.json(
        { error: "Unauthorized: wallet does not belong to this user" },
        { status: 403 }
      );
    }
    
    const publicKey = wallet.public_key || wallet.publicKey;
    
    if (!publicKey) {
      return NextResponse.json({
        error: "Public key not available from Privy. " +
                "This may require enabling Starknet support in your Privy dashboard or " +
                "upgrading to a Privy tier that supports Starknet public key access.",
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      publicKey: publicKey,
    });

  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || "Failed to fetch public key",
      },
      { status: 500 }
    );
  }
}
