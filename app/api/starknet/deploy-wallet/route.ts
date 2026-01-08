import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import { 
  getStarknetWallet, 
  computeReadyAddress, 
  deployReadyAccount 
} from "@/app/lib/starknet";

/**
 * POST /api/starknet/deploy-wallet
 * Deploys a Ready account for the user's Starknet wallet
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
    const { walletId, publicKey: providedPublicKey } = body;

    if (!walletId) {
      return NextResponse.json(
        { error: "walletId is required" },
        { status: 400 }
      );
    }

    const classHash = process.env.STARKNET_READY_CLASSHASH;
    if (!classHash) {
      return NextResponse.json(
        { error: "STARKNET_READY_CLASSHASH not configured" },
        { status: 500 }
      );
    }

    // Get wallet details from Privy
    const walletDetails = await getStarknetWallet(walletId, providedPublicKey);
    const { publicKey } = walletDetails;
    const address = computeReadyAddress(publicKey, classHash);

    // Deploy the Ready account
    const origin = request.headers.get("origin") || undefined;
    const deployResult = await deployReadyAccount({
      walletId,
      publicKey,
      classHash,
      userJwt: token,
      userId: authUserId,
      origin,
    });

    return NextResponse.json({
      success: true,
      walletId,
      address,
      publicKey,
      transactionHash: deployResult.transaction_hash,
    });
  } catch (error: any) {
    console.error("Error deploying Starknet wallet:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to deploy Starknet wallet",
      },
      { status: 500 }
    );
  }
}
