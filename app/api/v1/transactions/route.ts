import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import { 
  trackTransactionEvent, 
  trackApiRequest, 
  trackApiResponse, 
  trackApiError,
  trackBusinessEvent 
} from "@/app/lib/server-analytics";
import type { TransactionHistory, TransactionResponse } from "@/app/types";

// Route handler for GET requests
export const GET = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  
  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers
      .get("x-wallet-address")
      ?.toLowerCase();

    if (!walletAddress) {
      trackApiError(request, '/api/v1/transactions', 'GET', new Error('Unauthorized'), 401);
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Track API request
    trackApiRequest(request, '/api/v1/transactions', 'GET', {
      wallet_address: walletAddress,
    });

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

    // Track successful API response
    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/v1/transactions', 'GET', 200, responseTime, {
      wallet_address: walletAddress,
      total_transactions: count || 0,
      page,
      limit,
    });

    // Track business event
    trackBusinessEvent('Transaction History Retrieved', {
      wallet_address: walletAddress,
      total_transactions: count || 0,
      page,
      limit,
    }, walletAddress);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching transactions:", error);

    // Track API error
    const responseTime = Date.now() - startTime;
    trackApiError(request, '/api/v1/transactions', 'GET', error as Error, 500, {
      response_time_ms: responseTime,
    });

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

// Route handler for POST requests
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  
  try {
    // Get the wallet address from the header set by the middleware
    const walletAddress = request.headers.get("x-wallet-address")?.toLowerCase();  

    if (!walletAddress) {  
      trackApiError(request, '/api/v1/transactions', 'POST', new Error('Unauthorized'), 401);  
      return NextResponse.json(  
        { success: false, error: "Unauthorized" },  
        { status: 401 },  
      );  
    }  

    // Track API request  
    trackApiRequest(request, '/api/v1/transactions', 'POST', {  
      wallet_address: walletAddress,  
    });  
    

    const body = await request.json();  
    
    if (!body?.walletAddress) {  
      trackApiError(request, '/api/v1/transactions', 'POST', new Error('Missing wallet address in body'), 400);  
      return NextResponse.json(  
        { success: false, error: 'Bad Request: Missing wallet address' },  
        { status: 400 },  
      );  
    }  
    // Normalize wallet addresses to lowercase for comparison and storage  
    const normalizedBodyWalletAddress = String(body.walletAddress).toLowerCase();  

    if (normalizedBodyWalletAddress !== walletAddress) {  
      trackApiError(request, '/api/v1/transactions', 'POST', new Error('Wallet address mismatch'), 403);
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
        network: body.network,
        time_spent: body.time_spent,
        tx_hash: body.txHash,
        order_id: body.orderId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Track successful transaction creation
    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/v1/transactions', 'POST', 201, responseTime, {
      wallet_address: normalizedBodyWalletAddress,
      transaction_id: data.id,
    });

    // Track transaction event
    trackTransactionEvent('Transaction Created', normalizedBodyWalletAddress, {
      transaction_id: data.id,
      transaction_type: body.transactionType,
      from_currency: body.fromCurrency,
      to_currency: body.toCurrency,
      amount_sent: body.amountSent,
      amount_received: body.amountReceived,
      fee: body.fee,
      status: body.status,
      network: body.network,
      order_id: body.orderId,
    });

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error("Error creating transaction:", error);

    // Track API error
    const responseTime = Date.now() - startTime;
    trackApiError(request, '/api/v1/transactions', 'POST', error as Error, 500, {
      response_time_ms: responseTime,
    });

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
