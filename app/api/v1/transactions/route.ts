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
import {
  getExplorerLink,
  parseValidTransactionAmount,
  roundAmountForCurrency,
} from "@/app/utils";
import {
  assertTransactionWalletAuthorized,
  executeSwapTransactionLimitCheck,
} from "@/app/lib/swap-transaction-limit-server";
import { monthlyLimitReachedMessage } from "@/app/lib/kyc-limit-copy";
import type { V2FiatProviderAccountDTO } from "@/app/types";
import { fetchOrderDetails } from "@/app/api/aggregator";

/** Normalize aggregator VA fields for JSONB storage (Activepieces pay-in emails). */
function normalizeProviderAccount(
  raw: unknown,
): V2FiatProviderAccountDTO | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const institution = typeof o.institution === "string" ? o.institution.trim() : "";
  const accountIdentifier =
    typeof o.accountIdentifier === "string" ? o.accountIdentifier.trim() : "";
  const accountName =
    typeof o.accountName === "string" ? o.accountName.trim() : "";
  const validUntil =
    typeof o.validUntil === "string" ? o.validUntil.trim() : "";
  if (!institution || !accountIdentifier || !accountName || !validUntil) {
    return null;
  }
  const amountToTransferRaw = o.amountToTransfer;
  const amountToTransfer =
    typeof amountToTransferRaw === "string"
      ? amountToTransferRaw.trim()
      : typeof amountToTransferRaw === "number" &&
          Number.isFinite(amountToTransferRaw)
        ? String(amountToTransferRaw)
        : "";
  const currency =
    typeof o.currency === "string" ? o.currency.trim() : "";

  return {
    institution,
    accountIdentifier,
    accountName,
    validUntil,
    ...(amountToTransfer ? { amountToTransfer } : {}),
    ...(currency ? { currency } : {}),
  };
}

async function persistOnrampProviderAccount(
  transactionId: string,
  providerAccount: V2FiatProviderAccountDTO,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const attempt = async () =>
    supabaseAdmin
      .from("transactions")
      .update({ provider_account: providerAccount })
      .eq("id", transactionId);

  let { error } = await attempt();
  if (error) {
    ({ error } = await attempt());
  }
  if (error) return { ok: false, error };
  return { ok: true };
}

/** Remove a limit-RPC insert when onramp VA cannot be verified/persisted. */
async function rollbackOnrampInsert(
  transactionId: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const { error } = await supabaseAdmin
    .from("transactions")
    .delete()
    .eq("id", transactionId);
  if (error) return { ok: false, error };
  return { ok: true };
}

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

    const walletAuth = await assertTransactionWalletAuthorized(
      request,
      walletAddress,
      normalizedBodyWalletAddress,
    );
    if (!walletAuth.ok) {
      if (walletAuth.reason === "missing_user_context") {
        trackApiError(
          request,
          "/api/v1/transactions",
          "POST",
          new Error("Missing user context for wallet mismatch resolution"),
          401,
        );
      } else if (walletAuth.reason === "wallet_mismatch") {
        trackApiError(
          request,
          "/api/v1/transactions",
          "POST",
          new Error("Wallet address mismatch"),
          403,
        );
      } else if (walletAuth.reason === "privy_lookup_failed") {
        trackApiError(
          request,
          "/api/v1/transactions",
          "POST",
          new Error("Linked wallet lookup failed"),
          503,
        );
      }
      return walletAuth.response;
    }

    const normalizedEmail =
      typeof body.email === "string" ? body.email.trim() || null : null;
    const explorerLink =
      body.network && body.txHash
        ? getExplorerLink(body.network, body.txHash)
        : "";

    const parsedAmountSent = parseValidTransactionAmount(body.amountSent);
    const parsedAmountReceived = parseValidTransactionAmount(body.amountReceived);
    if (parsedAmountSent === null || parsedAmountReceived === null) {
      trackApiError(
        request,
        "/api/v1/transactions",
        "POST",
        new Error("Invalid amountSent or amountReceived"),
        400,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Bad Request: amountSent and amountReceived must be valid numbers",
        },
        { status: 400 },
      );
    }
    const amountSent = roundAmountForCurrency(parsedAmountSent);
    const amountReceived = roundAmountForCurrency(parsedAmountReceived);

    // Insert transaction
    // KYC tier enforcement for swap and onramp (not transfer).
    // Uses an atomic stored procedure to prevent race conditions where two concurrent
    // requests both pass the limit check before either insert is committed.
    const normalizedTransactionType =
      body.transactionType === "swap" ? "offramp" : body.transactionType;
    const normalizedOrderId =
      typeof body.orderId === "string" ? body.orderId.trim() : "";

    if (
      normalizedTransactionType === "offramp" ||
      normalizedTransactionType === "onramp"
    ) {
      if (normalizedTransactionType === "onramp" && !normalizedOrderId) {
        trackApiError(
          request,
          "/api/v1/transactions",
          "POST",
          new Error("Missing orderId for onramp"),
          400,
        );
        return NextResponse.json(
          {
            success: false,
            error: "Bad Request: orderId is required for onramp transactions",
          },
          { status: 400 },
        );
      }

      const swapResult = await executeSwapTransactionLimitCheck(
        normalizedBodyWalletAddress,
        {
          transactionType: normalizedTransactionType,
          fromCurrency: body.fromCurrency,
          toCurrency: body.toCurrency,
          amountSent,
          amountReceived,
          fee: body.fee,
          recipient: body.recipient,
          status: body.status,
          network: body.network,
          time_spent: body.time_spent,
          txHash: body.txHash,
          orderId: normalizedOrderId || undefined,
        },
        {
          dryRun: false,
          explorerLink: explorerLink || null,
          normalizedEmail,
        },
      );

      if (swapResult.kind === "kyc_db_error") {
        return NextResponse.json(
          {
            success: false,
            error: "Unable to verify transaction limits. Please try again.",
          },
          { status: 503 },
        );
      }

      if (swapResult.kind === "kyc_required") {
        trackApiError(
          request,
          "/api/v1/transactions",
          "POST",
          new Error("KYC required"),
          403,
        );
        return NextResponse.json(
          {
            success: false,
            error: "Identity verification required to make transactions.",
          },
          { status: 403 },
        );
      }

      if (swapResult.kind === "rate_unavailable") {
        return NextResponse.json(
          {
            success: false,
            error:
              "Unable to verify transaction amount. The exchange rate service is unavailable for this network — try again shortly.",
          },
          { status: 503 },
        );
      }

      if (swapResult.kind === "limit_exceeded") {
        trackApiError(
          request,
          "/api/v1/transactions",
          "POST",
          new Error("Monthly KYC limit exceeded"),
          403,
        );
        return NextResponse.json(
          {
            success: false,
            error: monthlyLimitReachedMessage(
              swapResult.monthlyLimit,
              swapResult.pooledWalletCount,
            ),
          },
          { status: 403 },
        );
      }

      if (swapResult.kind === "rpc_failed") {
        throw swapResult.error;
      }

      if (swapResult.kind === "unexpected_rpc") {
        throw new Error(
          "Unexpected RPC response from insert_swap_transaction_if_within_limit",
        );
      }

      const rpcDataId = swapResult.id;
      if (!rpcDataId) {
        throw new Error(
          "Unexpected RPC response from insert_swap_transaction_if_within_limit",
        );
      }

      // Onramp pay-in emails need VA details from the aggregator order — never
      // trust body.providerAccount (client-controlled payment destination).
      if (normalizedTransactionType === "onramp") {
        const failOnramp = async (
          status: number,
          clientError: string,
          logError: Error,
        ) => {
          const cleanup = await rollbackOnrampInsert(rpcDataId);
          if (!cleanup.ok) {
            console.error(
              "Failed to roll back onramp insert after provider_account error:",
              cleanup.error,
            );
            trackApiError(
              request,
              "/api/v1/transactions",
              "POST",
              new Error("Failed to roll back onramp insert", {
                cause: cleanup.error,
              }),
              500,
            );
            return NextResponse.json(
              {
                success: false,
                error:
                  "Failed to finalize onramp transaction. Please contact support if this persists.",
              },
              { status: 500 },
            );
          }
          trackApiError(
            request,
            "/api/v1/transactions",
            "POST",
            logError,
            status,
          );
          return NextResponse.json(
            { success: false, error: clientError },
            { status },
          );
        };

        const orderId = normalizedOrderId;
        let providerAccount: V2FiatProviderAccountDTO | null = null;
        try {
          const orderResponse = await fetchOrderDetails(orderId);
          providerAccount = normalizeProviderAccount(
            orderResponse.data?.providerAccount,
          );
        } catch (orderError) {
          console.error(
            "Failed to fetch aggregator order for provider_account:",
            orderError,
          );
          return failOnramp(
            502,
            "Unable to verify onramp payment details. Please try again.",
            orderError instanceof Error
              ? orderError
              : new Error(String(orderError)),
          );
        }

        if (!providerAccount) {
          return failOnramp(
            502,
            "Onramp payment details are not available yet. Please try again.",
            new Error("Aggregator order missing providerAccount"),
          );
        }

        const persistResult = await persistOnrampProviderAccount(
          rpcDataId,
          providerAccount,
        );
        if (!persistResult.ok) {
          console.error(
            "Failed to persist onramp provider_account:",
            persistResult.error,
          );
          return failOnramp(
            500,
            "Failed to save onramp payment details. Please try again.",
            new Error("Failed to persist provider_account", {
              cause: persistResult.error,
            }),
          );
        }
      }

      const responseTime = Date.now() - startTime;
      trackApiResponse("/api/v1/transactions", "POST", 201, responseTime, {
        wallet_address: normalizedBodyWalletAddress,
        transaction_id: rpcDataId,
      });
      trackTransactionEvent(
        "Transaction Created",
        normalizedBodyWalletAddress,
        {
          transaction_id: rpcDataId,
          transaction_type: normalizedTransactionType,
          from_currency: body.fromCurrency,
          to_currency: body.toCurrency,
          amount_sent: amountSent,
          amount_received: amountReceived,
          fee: body.fee,
          status: body.status,
          network: body.network,
          order_id: normalizedOrderId || undefined,
        },
      );

      return NextResponse.json(
        { success: true, data: { id: rpcDataId } },
        { status: 201 },
      );
    }

    // Non-swap transactions: direct insert (no KYC limit enforcement)
    const { data, error } = await supabaseAdmin
      .from("transactions")
      .insert({
        wallet_address: normalizedBodyWalletAddress,
        transaction_type: body.transactionType,
        from_currency: body.fromCurrency,
        to_currency: body.toCurrency,
        amount_sent: amountSent,
        amount_received: amountReceived,
        fee: body.fee,
        recipient: body.recipient,
        status: body.status,
        network: body.network,
        time_spent: body.time_spent,
        tx_hash: body.txHash,
        order_id: normalizedOrderId || undefined,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23514") {
        console.error("Transaction insert constraint violation:", error);
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid transaction data. If this persists, contact support.",
          },
          { status: 400 },
        );
      }
      throw error;
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse('/api/v1/transactions', 'POST', 201, responseTime, {
      wallet_address: normalizedBodyWalletAddress,
      transaction_id: data.id,
    });
    trackTransactionEvent('Transaction Created', normalizedBodyWalletAddress, {
      transaction_id: data.id,
      transaction_type: normalizedTransactionType,
      from_currency: body.fromCurrency,
      to_currency: body.toCurrency,
      amount_sent: amountSent,
      amount_received: amountReceived,
      fee: body.fee,
      status: body.status,
      network: body.network,
      order_id: normalizedOrderId || undefined,
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
