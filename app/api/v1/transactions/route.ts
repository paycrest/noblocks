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
import { getExplorerLink } from "@/app/utils";

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

    // KYC tier enforcement — only applies to swap transactions
    if (body.transactionType === "swap") {
      const KYC_MONTHLY_LIMITS: Record<number, number> = {
        0: 0,
        1: 100,
        2: 15000,
        3: 50000,
      };

      const now = new Date();
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const TRACKED_CURRENCIES = ["USDC", "USDT", "cUSD", "cNGN"];

      const [kycResult, spendResult] = await Promise.all([
        supabaseAdmin
          .from("user_kyc_profiles")
          .select("tier")
          .eq("wallet_address", walletAddress)
          .maybeSingle(),
        supabaseAdmin
          .from("transactions")
          .select("amount_sent, from_currency")
          .eq("wallet_address", walletAddress)
          .eq("transaction_type", "swap")
          .in("status", ["fulfilling", "completed"])
          .in("from_currency", TRACKED_CURRENCIES)
          .gte("created_at", monthStart.toISOString()),
      ]);

      const tier = Math.min(Math.max(Number(kycResult.data?.tier ?? 0), 0), 3);
      const monthlyLimit = KYC_MONTHLY_LIMITS[tier] ?? 0;

      if (monthlyLimit === 0) {
        trackApiError(request, '/api/v1/transactions', 'POST', new Error('KYC required'), 403);
        return NextResponse.json(
          { success: false, error: "Identity verification required to make transactions." },
          { status: 403 },
        );
      }

      // Convert amounts to USD
      let cngnToUsdRate: number | null = null;
      if (
        spendResult.data?.some((tx) => tx.from_currency === "cNGN") ||
        body.fromCurrency === "cNGN"
      ) {
        try {
          const aggregatorUrl = process.env.NEXT_PUBLIC_AGGREGATOR_URL;
          if (aggregatorUrl) {
            const rateRes = await fetch(`${aggregatorUrl}/rates/USDC/1/NGN`, {
              signal: AbortSignal.timeout(5000),
            });
            if (rateRes.ok) {
              const rateData = await rateRes.json();
              const rate = Number(rateData?.data);
              if (rate > 0) cngnToUsdRate = rate;
            }
          }
        } catch {
          // Rate unavailable — cNGN will be excluded from spend calculation (safe degradation)
        }
      }

      let monthlySpent = 0;
      for (const tx of spendResult.data ?? []) {
        const rawAmount = parseFloat(tx.amount_sent) || 0;
        if (tx.from_currency === "cNGN") {
          if (cngnToUsdRate !== null) monthlySpent += rawAmount / cngnToUsdRate;
        } else {
          monthlySpent += rawAmount;
        }
      }

      // Convert this transaction's amount to USD
      let thisTxUsd = parseFloat(body.amountSent) || 0;
      if (body.fromCurrency === "cNGN") {
        if (cngnToUsdRate === null) {
          return NextResponse.json(
            { success: false, error: "Unable to verify transaction amount. Please try again." },
            { status: 503 },
          );
        }
        thisTxUsd = thisTxUsd / cngnToUsdRate;
      }

      if (monthlySpent + thisTxUsd > monthlyLimit) {
        trackApiError(request, '/api/v1/transactions', 'POST', new Error('Monthly KYC limit exceeded'), 403);
        return NextResponse.json(
          {
            success: false,
            error: `Monthly transaction limit of $${monthlyLimit.toLocaleString()} reached. Upgrade your verification tier to continue.`,
          },
          { status: 403 },
        );
      }
    }

    const normalizedEmail =
      typeof body.email === "string" ? body.email.trim() || null : null;

    const explorerLink =
      body.network && body.txHash
        ? getExplorerLink(body.network, body.txHash)
        : "";

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
        email: normalizedEmail,
        ...(explorerLink ? { explorer_link: explorerLink } : {}),
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
