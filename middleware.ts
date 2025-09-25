import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { supabaseAdmin } from "@/app/lib/supabase";
import { getWalletAddressFromPrivyUserId } from "@/app/lib/privy";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";

async function authorizationMiddleware(req: NextRequest) {
  const startTime = Date.now();
  const endpoint = req.nextUrl.pathname;
  const method = req.method;

  // Log API request for analytics (Edge Runtime compatible)
  console.log(`[Middleware Analytics] API Request: ${method} ${endpoint}`, {
    middleware: true,
    has_auth_header: !!req.headers.get("Authorization"),
    user_agent: req.headers.get("user-agent"),
    timestamp: new Date().toISOString(),
  });

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    const responseTime = Date.now() - startTime;
    console.log(`[Middleware Analytics] API Error: Missing JWT`, {
      endpoint,
      method,
      status_code: 401,
      response_time_ms: responseTime,
      middleware: true,
    });
    return NextResponse.json({ error: "Missing JWT" }, { status: 401 });
  }

  try {
    const { payload } = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    const privyUserId = payload.sub;

    if (!privyUserId) {
      return NextResponse.json(
        { error: "Invalid JWT: Missing subject" },
        { status: 401 },
      );
    }
    const walletAddress = await getWalletAddressFromPrivyUserId(privyUserId);

    try {
      const { error } = await supabaseAdmin.rpc("set_current_wallet_address", {
        wallet_address: walletAddress,
      });

      if (error) {
        console.error("Failed to set wallet address for RLS:", error);
      }
    } catch (rpcError) {
      console.error("RPC error when setting wallet address:", rpcError);
    }

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-wallet-address", walletAddress);
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    // Optional: also expose to client responses if needed
    response.headers.set("x-wallet-address", walletAddress);

    // Log successful response for analytics
    const responseTime = Date.now() - startTime;
    console.log(`[Middleware Analytics] API Response: Success`, {
      endpoint,
      method,
      status_code: 200,
      response_time_ms: responseTime,
      middleware: true,
      wallet_address: walletAddress,
      privy_user_id: privyUserId,
    });

    // Log server-side login detection
    console.log(`[Middleware Analytics] Server Login Detected`, {
      wallet_address: walletAddress,
      privy_user_id: privyUserId,
      endpoint,
      method,
      response_time_ms: responseTime,
      login_source: "api_request",
    });

    return response;
  } catch (error) {
    console.error("JWT verification error in middleware:", error);

    // Log JWT verification error for analytics
    const responseTime = Date.now() - startTime;
    console.log(`[Middleware Analytics] API Error: JWT Verification Failed`, {
      endpoint,
      method,
      status_code: 401,
      response_time_ms: responseTime,
      middleware: true,
      error_type: "jwt_verification_failed",
      error_message: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json({ error: "Invalid JWT" }, { status: 401 });
  }
}

export default authorizationMiddleware;

export const config = {
  matcher: [
    "/api/v1/transactions",
    "/api/v1/transactions/:path*",
    "/api/v1/account/verify",
    "/api/v1/account/:path*",
    // (optional) add other instrumented API routes:
    // '/api/v1/kyc/:path*', '/api/v1/rates', '/api/v1/rates/:path*'
  ],
};
