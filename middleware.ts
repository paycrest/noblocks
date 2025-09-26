import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { getWalletAddressFromPrivyUserId } from "@/app/lib/privy";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";

/**
 * Determines if a request is internal or authorized to receive sensitive headers
 * This prevents identifier leakage to external clients
 */
function isInternalOrAuthorizedRequest(req: NextRequest): boolean {
  // Check for internal API key (server-to-server requests)
  const internalAuth = req.headers.get("x-internal-auth");
  const expectedInternalAuth = process.env.INTERNAL_API_KEY;
  if (internalAuth && expectedInternalAuth && internalAuth === expectedInternalAuth) {
    return true;
  }

  // Check for specific internal origins (if configured)
  const origin = req.headers.get("origin");
  const allowedInternalOrigins = process.env.INTERNAL_ORIGINS?.split(",") || [];
  if (origin && allowedInternalOrigins.some(allowedOrigin => 
    new URL(origin).origin === new URL(allowedOrigin).origin
  )) {
    return true;
  }

  // Check for specific user agent patterns that indicate internal services
  const userAgent = req.headers.get("user-agent") || "";
  const internalUserAgents = [
    "Paycrest-Internal",
    "Noblocks-Internal",
    "Server-Side-Rendering"
  ];
  if (internalUserAgents.some(pattern => userAgent.includes(pattern))) {
    return true;
  }

  // Default to false - external clients should not receive wallet address
  return false;
}

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

    // Set wallet context via internal server route (non-blocking)
    try {
      const internalAuth = process.env.INTERNAL_API_KEY;
      if (internalAuth) {
        // Fire-and-forget call to internal server route
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/internal/set-wallet-context`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-auth': internalAuth,
          },
          body: JSON.stringify({ walletAddress }),
        }).catch(error => {
          console.warn('Failed to set wallet context:', error);
        });
      }
    } catch (contextError) {
      console.warn('Error setting wallet context:', contextError);
    }

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
