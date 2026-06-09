import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackTransactionEvent,
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import { getExplorerLink } from "@/app/utils";
import { assertTransactionWalletMatchesJwtUser } from "@/app/lib/transaction-wallet-auth";

// Route handler for PUT requests
export const PUT = withRateLimit(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const startTime = Date.now();
    const { id } = await params;

    try {
      const body = await request.json();
      const { txHash, timeSpent, status } = body;

      const { data: existingTransaction, error: fetchError } =
        await supabaseAdmin.from("transactions").select("*").eq("id", id).single();

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

      const auth = await assertTransactionWalletMatchesJwtUser(
        request,
        existingTransaction.wallet_address,
      );
      if (!auth.ok) {
        trackApiError(
          request,
          `/api/v1/transactions/${id}`,
          "PUT",
          new Error(auth.error),
          auth.status,
        );
        return NextResponse.json(
          { success: false, error: auth.error },
          { status: auth.status },
        );
      }
      const walletAddress = auth.normalizedRowWallet;

      trackApiRequest(request, `/api/v1/transactions/${id}`, "PUT", {
        wallet_address: walletAddress,
        transaction_id: id,
        new_status: body.status,
      });

      const explorerLink =
        txHash && existingTransaction.network
          ? getExplorerLink(existingTransaction.network, txHash)
          : undefined;

      // Update transaction
      const { data, error } = await supabaseAdmin
        .from("transactions")
        .update({
          tx_hash: txHash,
          time_spent: timeSpent,
          status: status,
          ...(explorerLink && { explorer_link: explorerLink }),
          updated_at: new Date().toISOString(),
        })
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
