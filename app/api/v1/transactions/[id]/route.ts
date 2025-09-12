import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";

// Route handler for PUT requests
export const PUT = withRateLimit(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    try {
      const { id } = params;

      const walletAddress = request.headers
        .get("x-wallet-address")
        ?.toLowerCase();

      if (!walletAddress) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }

      const body = await request.json();
      const { txHash, timeSpent, status } = body;

      // First verify that the transaction belongs to the wallet
      const { data: existingTransaction, error: fetchError } =
        await supabaseAdmin
          .from("transactions")
          .select("*")
          .eq("id", id)
          .eq("wallet_address", walletAddress)
          .single();

      if (fetchError || !existingTransaction) {
        return NextResponse.json(
          { success: false, error: "Transaction not found or unauthorized" },
          { status: 404 },
        );
      }

      // Update transaction
      const { data, error } = await supabaseAdmin
        .from("transactions")
        .update({
          tx_hash: txHash,
          time_spent: timeSpent,
          status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("wallet_address", walletAddress)
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
