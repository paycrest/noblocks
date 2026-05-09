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
import { getKycMonthlyLimitsRecord } from "@/app/lib/kyc-tier-limits";
import { collectLinkedEvmAddressesForPrivyUserId } from "@/app/lib/privy";

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

    // Middleware pins x-wallet-address to Privy's embedded / primary EOA lookup.
    // The client may POST with smart wallet or injected wallet as the actor; allow
    // any EVM address linked to the same JWT user (Privy linked_accounts).
    if (normalizedBodyWalletAddress !== walletAddress) {
      const privyUserId = request.headers.get("x-user-id");
      if (!privyUserId) {
        trackApiError(
          request,
          "/api/v1/transactions",
          "POST",
          new Error("Missing user context for wallet mismatch resolution"),
          401,
        );
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }
      try {
        const linked = await collectLinkedEvmAddressesForPrivyUserId(
          privyUserId,
        );
        if (!linked.includes(normalizedBodyWalletAddress)) {
          trackApiError(
            request,
            "/api/v1/transactions",
            "POST",
            new Error("Wallet address mismatch"),
            403,
          );
          return NextResponse.json(
            {
              success: false,
              error: "Unauthorized: Wallet address mismatch",
            },
            { status: 403 },
          );
        }
      } catch (e) {
        console.error(
          "Privy linked-address resolution for POST /transactions:",
          e,
        );
        trackApiError(
          request,
          "/api/v1/transactions",
          "POST",
          e instanceof Error ? e : new Error("Linked wallet lookup failed"),
          503,
        );
        return NextResponse.json(
          {
            success: false,
            error: "Unable to verify wallet ownership. Please try again.",
          },
          { status: 503 },
        );
      }
    }

    const normalizedEmail =
      typeof body.email === "string" ? body.email.trim() || null : null;
    const explorerLink =
      body.network && body.txHash
        ? getExplorerLink(body.network, body.txHash)
        : "";

    // KYC tier enforcement — only applies to swap transactions
    // Uses an atomic stored procedure to prevent race conditions where two concurrent
    // requests both pass the limit check before either insert is committed.
    if (body.transactionType === "swap") {
      const KYC_MONTHLY_LIMITS = getKycMonthlyLimitsRecord();

      const { data: kycProfile, error: kycError } = await supabaseAdmin
        .from("user_kyc_profiles")
        .select("tier")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      if (kycError) {
        return NextResponse.json(
          { success: false, error: "Unable to verify transaction limits. Please try again." },
          { status: 503 },
        );
      }

      const tier = Math.min(Math.max(Number(kycProfile?.tier ?? 0), 0), 3);
      const monthlyLimit = KYC_MONTHLY_LIMITS[tier] ?? 0;

      if (monthlyLimit === 0) {
        trackApiError(request, '/api/v1/transactions', 'POST', new Error('KYC required'), 403);
        return NextResponse.json(
          { success: false, error: "Identity verification required to make transactions." },
          { status: 403 },
        );
      }

      // Always fetch the cNGN rate — the stored procedure needs it if historical
      // cNGN transactions exist, even if the current transaction is non-cNGN.
      let cngnToUsdRate = 0;
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
        // Rate unavailable — stored procedure will return rate_unavailable if cNGN is involved
      }

      // Atomic spend-check + insert (advisory lock prevents concurrent limit bypass)
      const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
        "insert_swap_transaction_if_within_limit",
        {
          p_wallet_address:    normalizedBodyWalletAddress,
          p_monthly_limit:     monthlyLimit,
          p_cngn_to_usd_rate:  cngnToUsdRate,
          p_transaction_type:  body.transactionType,
          p_from_currency:     body.fromCurrency,
          p_to_currency:       body.toCurrency,
          p_amount_sent:       parseFloat(body.amountSent) || 0,
          p_amount_received:   parseFloat(body.amountReceived) || 0,
          p_fee:               parseFloat(body.fee) || 0,
          p_recipient:         body.recipient,
          p_status:            body.status,
          p_network:           body.network || null,
          p_time_spent:        body.time_spent || null,
          p_tx_hash:           body.txHash || null,
          p_order_id:          body.orderId || null,
          p_email:             normalizedEmail,
          p_explorer_link:     explorerLink || null,
        },
      );

      if (rpcError) {
        throw rpcError;
      }

      const rpcData = rpcResult as {
        id?: string;
        error?: string;
        monthly_limit?: number;
      };

      if (rpcData.error === "rate_unavailable") {
        return NextResponse.json(
          { success: false, error: "Unable to verify transaction amount. Please try again." },
          { status: 503 },
        );
      }

      if (rpcData.error === "limit_exceeded") {
        trackApiError(request, '/api/v1/transactions', 'POST', new Error('Monthly KYC limit exceeded'), 403);
        return NextResponse.json(
          {
            success: false,
            error: `Monthly transaction limit of $${monthlyLimit.toLocaleString()} reached. Upgrade your verification tier to continue.`,
          },
          { status: 403 },
        );
      }

      if (!rpcData.id) {
        throw new Error("Unexpected RPC response from insert_swap_transaction_if_within_limit");
      }

      const responseTime = Date.now() - startTime;
      trackApiResponse('/api/v1/transactions', 'POST', 201, responseTime, {
        wallet_address: normalizedBodyWalletAddress,
        transaction_id: rpcData.id,
      });
      trackTransactionEvent('Transaction Created', normalizedBodyWalletAddress, {
        transaction_id: rpcData.id,
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

      return NextResponse.json({ success: true, data: { id: rpcData.id } }, { status: 201 });
    }

    // Non-swap transactions: direct insert (no KYC limit enforcement)
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

    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/v1/transactions', 'POST', 201, responseTime, {
      wallet_address: normalizedBodyWalletAddress,
      transaction_id: data.id,
    });
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
