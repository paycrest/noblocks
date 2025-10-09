import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";

// GET /api/blockfest/participants/[address]
export const GET = withRateLimit(
  async (_req: NextRequest, { params }: { params: { address: string } }) => {
    const start = Date.now();
    try {
      const address = decodeURIComponent(params.address ?? "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return NextResponse.json(
          { success: false, error: "Invalid wallet address format" },
          { status: 400 },
        );
      }

      const { data, error } = await supabaseAdmin
        .from("blockfest_participants")
        .select("wallet_address")
        .eq("wallet_address", address)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Supabase query error (blockfest_participants):", error);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to check participant",
            response_time_ms: Date.now() - start,
          },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        exists: Boolean(data),
        response_time_ms: Date.now() - start,
      });
    } catch (err) {
      console.error("BlockFest participants GET error:", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Internal Server Error";
      return NextResponse.json(
        {
          success: false,
          error: message,
          response_time_ms: Date.now() - start,
        },
        { status: 500 },
      );
    }
  },
);
