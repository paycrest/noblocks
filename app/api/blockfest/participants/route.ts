import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";

// POST /api/blockfest/participants
// Body: { walletAddress: string, email?: string, source?: string }
export const POST = withRateLimit(async (request: NextRequest) => {
  const start = Date.now();
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Unsupported content type" },
        { status: 415 },
      );
    }
    const body = await request.json().catch(() => null);

    if (!body || typeof body.walletAddress !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const walletAddress = String(body.walletAddress).trim().toLowerCase();
    const email = body.email ? String(body.email).trim() : null;
    const source = body.source ? String(body.source).trim() : "modal";

    // Basic EVM address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address format" },
        { status: 400 },
      );
    }

    // Upsert participant (idempotent)
    const { error } = await supabaseAdmin.from("blockfest_participants").upsert(
      {
        wallet_address: walletAddress,
        email,
        source,
      },
      { onConflict: "wallet_address" },
    );

    if (error) {
      console.error("Supabase upsert error (blockfest_participants):", error);
      return NextResponse.json(
        {
          success: false,
          error: error.message || "Failed to save participant",
          response_time_ms: Date.now() - start,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      response_time_ms: Date.now() - start,
    });
  } catch (err) {
    console.error("BlockFest participants API error:", err);
    const message =
      err instanceof Error && err.message
        ? err.message
        : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message, response_time_ms: Date.now() - start },
      { status: 500 },
    );
  }
});
