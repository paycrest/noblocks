import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { getWalletAddressFromPrivyUserId } from "@/app/lib/privy";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import { trackApiRequest, trackApiResponse, trackApiError } from "@/app/lib/server-analytics";

/**
 * Determines if a request is internal or authorized to receive sensitive headers
 * SECURITY: Only trust explicit authentication, never User-Agent or Origin
 */
function isInternalOrAuthorizedRequest(req: NextRequest): boolean {
  // Only trust an explicit internal credential. Origin/User-Agent are not reliable signals.
  const internalAuth = req.headers.get("x-internal-auth");
  const expected = process.env.INTERNAL_API_KEY;
  return Boolean(internalAuth && expected && internalAuth === expected);
}

async function authorizationMiddleware(req: NextRequest) {
  const startTime = Date.now();
  const endpoint = req.nextUrl.pathname;
  const method = req.method;

  // Track API request for analytics
  trackApiRequest(req, endpoint, method, {
    middleware: true,
    has_auth_header: !!req.headers.get("Authorization"),
  });

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    const responseTime = Date.now() - startTime;
    trackApiError(req, endpoint, method, new Error("Missing JWT"), 401, {
      middleware: true,
      error_type: "missing_jwt",
    });
    return NextResponse.json({ error: "Missing JWT" }, { status: 401 });
  }

  // Step 1: JWT Verification (separate error handling)
  let payload;
  let privyUserId;
  try {
    const jwtResult = await verifyJWT(token, DEFAULT_PRIVY_CONFIG);
    payload = jwtResult.payload;
    privyUserId = payload.sub;

    if (!privyUserId) {
      const responseTime = Date.now() - startTime;
      trackApiError(req, endpoint, method, new Error("Invalid JWT: Missing subject"), 401, {
        middleware: true,
        error_type: "jwt_missing_subject",
      });
      return NextResponse.json(
        { error: "Invalid JWT: Missing subject" },
        { status: 401 },
      );
    }
  } catch (jwtError) {
    const responseTime = Date.now() - startTime;
    console.error("JWT verification error in middleware:", jwtError);
    trackApiError(req, endpoint, method, jwtError instanceof Error ? jwtError : new Error("Unknown JWT error"), 401, {
      middleware: true,
      error_type: "jwt_verification_failed",
    });
    return NextResponse.json({ error: "Invalid JWT" }, { status: 401 });
  }

  // Step 2: Wallet Resolution (separate error handling)
  let walletAddress;
  try {
    walletAddress = await getWalletAddressFromPrivyUserId(privyUserId);
    
    if (!walletAddress) {
      const responseTime = Date.now() - startTime;
      trackApiError(req, endpoint, method, new Error("Unable to resolve wallet address"), 502, {
        middleware: true,
        error_type: "wallet_resolution_failed",
        privy_user_id: privyUserId,
      });
      return NextResponse.json(
        { error: "Unable to resolve wallet address" },
        { status: 502 },
      );
    }
  } catch (walletError) {
    const responseTime = Date.now() - startTime;
    console.error("Wallet resolution error in middleware:", walletError);
    trackApiError(req, endpoint, method, walletError instanceof Error ? walletError : new Error("Unknown wallet error"), 502, {
      middleware: true,
      error_type: "wallet_resolution_failed",
      privy_user_id: privyUserId,
    });
    return NextResponse.json(
      { error: "Unable to resolve wallet address" },
      { status: 502 },
    );
  }

  // Step 3: Set wallet context (improved error handling)
  const setWalletContext = async () => {
    const internalAuth = process.env.INTERNAL_API_KEY;
    if (!internalAuth) {
      console.warn('INTERNAL_API_KEY not configured, skipping wallet context setting');
      return;
    }

    // Fire-and-forget is best moved to a route handler using after().
    // If kept, prefer same-origin and gate behind a flag.
    if (process.env.ENABLE_WALLET_CONTEXT_SYNC === "true") {
      const url = new URL("/api/internal/set-wallet-context", req.nextUrl.origin);
      // Note: still not guaranteed to complete in middleware.
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-auth': internalAuth,
        },
        body: JSON.stringify({ walletAddress }),
      }).catch((error) => {
        console.warn('Failed to set wallet context:', error);
      });
    }
  };

  // Execute wallet context setting (non-blocking but with proper error handling)
  setWalletContext().catch(error => {
    console.error('Unhandled error in wallet context setting:', error);
  });

  // Step 4: Create response with proper headers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-wallet-address", walletAddress);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  
  // Only set x-wallet-address header for internal/authorized requests
  // This prevents identifier leakage to external clients
  const isInternalRequest = isInternalOrAuthorizedRequest(req);
  if (isInternalRequest) {
    response.headers.set("x-wallet-address", walletAddress);
  }

  // Track successful response for analytics
  const responseTime = Date.now() - startTime;
  trackApiResponse(endpoint, method, 200, responseTime, {
    middleware: true,
    wallet_address: walletAddress,
    privy_user_id: privyUserId,
  });

  return response;
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
