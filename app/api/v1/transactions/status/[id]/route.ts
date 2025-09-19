import { NextRequest, NextResponse } from "next/server";
// import { authMiddleware } from '@/middleware/auth';
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { 
  trackTransactionEvent, 
  trackApiRequest, 
  trackApiResponse, 
  trackApiError 
} from "@/app/lib/server-analytics";

export const PUT = withRateLimit(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const startTime = Date.now();
    const { id } = await params;
    
    try {
      const body = await request.json();

      // Track API request
      trackApiRequest(request, `/api/v1/transactions/status/${id}`, 'PUT', {
        transaction_id: id,
        new_status: body.status,
      });

      const { data: transaction, error: fetchError } = await supabaseAdmin
        .from("transactions")
        .select("wallet_address")
        .eq("id", id)
        .single();

      if (fetchError || !transaction) {
        trackApiError(request, `/api/v1/transactions/status/${id}`, 'PUT', new Error('Transaction not found'), 404);
        return NextResponse.json(
          { success: false, error: "Transaction not found" },
          { status: 404 },
        );
      }

      // Update transaction
      const { data, error } = await supabaseAdmin
        .from("transactions")
        .update({
          status: body.status,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Track successful status update
      const responseTime = Date.now() - startTime;
      trackApiResponse(`/api/v1/transactions/status/${id}`, 'PUT', 200, responseTime, {
        transaction_id: id,
        wallet_address: transaction.wallet_address,
        new_status: body.status,
      });

      // Track transaction status change event
      trackTransactionEvent('Transaction Status Updated', transaction.wallet_address, {
        transaction_id: id,
        new_status: body.status,
        status_change_source: 'api',
      });

      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error("Error updating transaction:", error);

      // Track API error
      const responseTime = Date.now() - startTime;
      trackApiError(request, `/api/v1/transactions/status/${id}`, 'PUT', error as Error, 500, {
        response_time_ms: responseTime,
      });

      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  },
);
