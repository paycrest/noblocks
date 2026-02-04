import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackTransactionEvent,
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";

// Route handler for PUT requests
export const PUT = withRateLimit(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const startTime = Date.now();
    const { id } = await params;

    try {
      const walletAddress = request.headers
        .get("x-wallet-address")
        ?.toLowerCase();
      const body = await request.json();

      if (!walletAddress) {
        trackApiError(
          request,
          `/api/v1/transactions/${id}`,
          "PUT",
          new Error("Unauthorized"),
          401,
        );
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      trackApiRequest(request, `/api/v1/transactions/${id}`, "PUT", {
        wallet_address: walletAddress,
        transaction_id: id,
        new_status: body.status,
      });

      const { txHash, timeSpent, status, refundReason } = body;

      // First verify that the transaction belongs to the wallet
      const { data: existingTransaction, error: fetchError } =
        await supabaseAdmin
          .from("transactions")
          .select("*")
          .eq("id", id)
          .eq("wallet_address", walletAddress)
          .single();

      if (fetchError || !existingTransaction) {
        trackApiError(
          request,
          `/api/v1/transactions/${id}`,
          "PUT",
          new Error("Transaction not found or unauthorized"),
          404,
        );
        return NextResponse.json(
          { success: false, error: "Transaction not found or unauthorized" },
          { status: 404 },
        );
      }

      // Update transaction (only include refund_reason when provided, e.g. for refunded status)
      const updatePayload: Record<string, unknown> = {
        tx_hash: txHash,
        time_spent: timeSpent,
        status: status,
        updated_at: new Date().toISOString(),
      };
      if (refundReason !== undefined) {
        updatePayload.refund_reason = refundReason;
      }
      const { data, error } = await supabaseAdmin
        .from("transactions")
        .update(updatePayload)
        .eq("id", id)
        .eq("wallet_address", walletAddress)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Track successful transaction update
      const responseTime = Date.now() - startTime;
      trackApiResponse(`/api/v1/transactions/${id}`, "PUT", 200, responseTime, {
        wallet_address: walletAddress,
        transaction_id: id,
        updated_fields: Object.keys(body),
      });

      // Track transaction event
      trackTransactionEvent("Transaction Updated", walletAddress, {
        transaction_id: id,
        tx_hash: txHash,
        time_spent: timeSpent,
        status: status,
        previous_status: existingTransaction.status,
      });

      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error("Error updating transaction:", error);

      // Track API error
      const responseTime = Date.now() - startTime;
      trackApiError(
        request,
        `/api/v1/transactions/${id}`,
        "PUT",
        error as Error,
        500,
        {
          response_time_ms: responseTime,
        },
      );

      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);
