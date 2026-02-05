import { NextRequest, NextResponse } from "next/server";
import { getPrivyClient } from "@/app/lib/privy";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";

/**
 * POST /api/starknet/create-wallet
 * Creates a new Starknet wallet for the user via Privy
 */
export async function POST(request: NextRequest) {
  try {
    // Extract and verify JWT token
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 },
      );
    }

    const token = authHeader.substring(7);
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    const authUserId = payload.sub || payload.userId;

    if (!authUserId) {
      return NextResponse.json(
        { error: "Invalid token: missing user ID" },
        { status: 401 },
      );
    }

    // Get request body
    const body = await request.json();

    const userId = authUserId;

    if (!userId) {
      return NextResponse.json(
        { error: "No user ID available" },
        { status: 400 },
      );
    }

    // First, check if user already has a Starknet wallet
    const privy = getPrivyClient();

    let existingStarknetWallet = null;
    try {
      const user = await privy.getUser(userId);
      const linkedAccounts = user.linkedAccounts || [];
      existingStarknetWallet = linkedAccounts.find(
        (account: any) =>
          account.type === "wallet" &&
          (account.chainType === "starknet" ||
            account.chain_type === "starknet"),
      );

      if (existingStarknetWallet) {
        const wallet = existingStarknetWallet as any;
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
      // Re-throw the error to prevent duplicate wallet creation
      throw error;
    }

    // Create Starknet wallet via Privy
    const walletPayload = {
      chainType: "starknet",
      owner: { userId },
    } as any;

    const wallet = await privy.walletApi.createWallet(walletPayload);

    return NextResponse.json({
      success: true,
      wallet: {
        id: wallet.id,
        address: wallet.address,
        publicKey: (wallet as any).public_key || (wallet as any).publicKey,
        chainType: (wallet as any).chainType || (wallet as any).chain_type,
      },
    });
  } catch (error: any) {
    console.error("Error creating Starknet wallet:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to create Starknet wallet",
      },
      { status: 500 },
    );
  }
}
