import { NextRequest, NextResponse } from "next/server";
// import { authMiddleware } from '@/middleware/auth';
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { z } from "zod";

const StatusBodySchema = z.object({
  status: z.enum(["pending", "submitted", "confirmed", "failed", "cancelled"]),
});

export const PUT = withRateLimit(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    try {
      const { id } = params;
      // const body = await request.json();
      // Require caller identity
      const walletAddress = request.headers
        .get("x-wallet-address")
        ?.toLowerCase();
      if (!walletAddress) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }

      // Parse and validate body
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON body" },
          { status: 400 },
        );
      }
      const parsed = StatusBodySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid status payload" },
          { status: 400 },
        );
      }
      const { status } = parsed.data;

      const { data: transaction, error: fetchError } = await supabaseAdmin
        .from("transactions")
        .select("wallet_address")
        .eq("id", id)
        .single();

      if (
        fetchError ||
        !transaction ||
        transaction.wallet_address?.toLowerCase() !== walletAddress
      ) {
        return NextResponse.json(
          // { success: false, error: "Transaction not found" },
          { success: false, error: "Transaction not found or unauthorized" },
          { status: 404 },
        );
      }

      // Update transaction
      const { data, error } = await supabaseAdmin
        .from("transactions")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error("Error updating transaction:", error);
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);
