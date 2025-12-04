import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";

// Internal server route for setting wallet context
// This runs in Node.js runtime with access to service-role key
export async function POST(request: NextRequest) {
  try {
    // Verify this is an internal request
    const authHeader = request.headers.get("x-internal-auth");
    const expectedAuth = process.env.INTERNAL_API_KEY;
    
    if (!authHeader || !expectedAuth || authHeader !== expectedAuth) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address" },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address format" },
        { status: 400 }
      );
    }

    // Set wallet context using service-role key
    const { error } = await supabaseAdmin.rpc("set_current_wallet_address", {
      wallet_address: walletAddress,
    });

    if (error) {
      console.error("Failed to set wallet address for RLS:", error);
      return NextResponse.json(
        { success: false, error: "Failed to set wallet context" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Wallet context set successfully",
      walletAddress,
    });
  } catch (error) {
    console.error("Error setting wallet context:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
