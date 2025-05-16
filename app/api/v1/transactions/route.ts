import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import type { TransactionHistory, TransactionResponse } from "@/app/types";

// Route handler for GET requests
export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    const {
      data: transactions,
      error,
      count,
    } = await supabaseAdmin
      .from("transactions")
      .select("*", { count: "exact" })
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Supabase query error:", error);
      throw error;
    }

    const response: TransactionResponse = {
      success: true,
      data: {
        total: count || 0,
        page,
        limit,
        transactions: transactions as TransactionHistory[],
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

// Route handler for POST requests
export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers.get("x-wallet-address");

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    // Normalize wallet addresses to lowercase for comparison and storage
    const normalizedBodyWalletAddress = body.walletAddress.toLowerCase();

    if (normalizedBodyWalletAddress !== walletAddress) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Wallet address mismatch" },
        { status: 403 },
      );
    }

    // Insert transaction
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .insert({
        wallet_address: normalizedBodyWalletAddress,
        transaction_type: body.transactionType,
        from_currency: body.fromCurrency,
        to_currency: body.toCurrency,
        amount_sent: body.amountSent,
        amount_received: body.amountReceived,
        fee: body.fee,
        recipient: body.recipient,
        status: body.status,
        time_spent: body.time_spent,
        tx_hash: body.txHash,
        order_id: body.orderId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Error creating transaction:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
