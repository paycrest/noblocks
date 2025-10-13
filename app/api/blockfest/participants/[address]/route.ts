import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { isValidEvmAddress } from "@/app/lib/validation";
import { BLOCKFEST_END_DATE } from "@/app/utils";

// GET /api/blockfest/participants/[address]
export const GET = withRateLimit(
  async (_req: NextRequest, { params }: { params: { address: string } }) => {
    const start = Date.now();

    // Early return if BlockFest campaign has expired
    if (Date.now() > BLOCKFEST_END_DATE.getTime()) {
      return NextResponse.json(
        {
          success: false,
          error: "Campaign ended",
          code: "CAMPAIGN_ENDED",
          message:
            "BlockFest campaign has ended. Participant checks are no longer available.",
          response_time_ms: Date.now() - start,
        },
        { status: 410 },
      );
    }

    try {
      const { address } = await params;
      const decodedAddress = decodeURIComponent(address ?? "")
        .trim()
        .toLowerCase();
      if (!isValidEvmAddress(decodedAddress)) {
        return NextResponse.json(
          { success: false, error: "Invalid wallet address format" },
          { status: 400 },
        );
      }

      const { data, error } = await supabaseAdmin
        .from("blockfest_participants")
        .select()
        .eq("normalized_address", decodedAddress)
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
      return NextResponse.json(
        {
          success: false,
          error: "Internal Server Error",
          response_time_ms: Date.now() - start,
        },
        { status: 500 },
      );
    }
  },
);
