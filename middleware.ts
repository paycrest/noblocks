import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";

// Inline lightweight edge-compatible helpers to avoid pulling in heavy SDKs

const _appId = process.env.PRIVY_APP_ID;
const _appSecret = process.env.PRIVY_APP_SECRET;

if (!_appId || !_appSecret) {
  throw new Error(
    "Missing required env vars: PRIVY_APP_ID and PRIVY_APP_SECRET must be set",
  );
}

const PRIVY_APP_ID: string = _appId;
const PRIVY_APP_SECRET: string = _appSecret;

const PRIVY_JWKS_URL = `https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`;
const PRIVY_JWT_ISSUER = "privy.io";
const PRIVY_JWKS = createRemoteJWKSet(new URL(PRIVY_JWKS_URL));

interface PrivyLinkedAccount {
  type: string;
  address?: string;
  connector_type?: string;
  chain_id?: string;
}

interface PrivyUserResponse {
  linked_accounts?: PrivyLinkedAccount[];
}

async function verifyPrivyJWT(token: string) {
  const { payload } = await jwtVerify(token, PRIVY_JWKS, {
    issuer: PRIVY_JWT_ISSUER,
    algorithms: ["ES256"],
  });
  return payload;
}

async function getWalletAddressFromPrivyUserId(
  userId: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`https://auth.privy.io/api/v1/users/${userId}`, {
      headers: {
        Authorization: `Basic ${btoa(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`)}`,
        "privy-app-id": PRIVY_APP_ID,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Privy API error: ${res.status}`);
    }

    const user = (await res.json()) as PrivyUserResponse;
    const accounts = user.linked_accounts || [];

    const wallet =
      accounts.find(
        (a) => a.type === "wallet" && a.connector_type === "embedded",
      ) ||
      accounts.find(
        (a) => a.type === "wallet" && a.chain_id === "eip155:1",
      );

    if (!wallet?.address) {
      throw new Error("No embedded or Ethereum wallet found for Privy user");
    }

    return wallet.address.toLowerCase();
  } finally {
    clearTimeout(timeoutId);
  }
}

// Edge-safe analytics helper
async function trackMiddlewareAnalytics(
  type: "request" | "response" | "error",
  data: any,
  baseUrl: string,
) {
  try {
    const internalAuth = process.env.INTERNAL_API_KEY;
    if (!internalAuth) return;

    await fetch(`${baseUrl}/api/internal/middleware-analytics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-auth": internalAuth,
      },
      body: JSON.stringify({ type, ...data }),
    });
  } catch (error) {
    // Silently fail - don't break middleware for analytics
    console.warn("Middleware analytics failed:", error);
  }
}

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
  trackMiddlewareAnalytics(
    "request",
    {
      endpoint,
      method,
      properties: {
        middleware: true,
        has_auth_header: !!req.headers.get("Authorization"),
      },
    },
    req.nextUrl.origin,
  );

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    const responseTime = Date.now() - startTime;
    trackMiddlewareAnalytics(
      "error",
      {
        endpoint,
        method,
        statusCode: 401,
        errorMessage: "Missing JWT",
        properties: {
          middleware: true,
          error_type: "missing_jwt",
        },
      },
      req.nextUrl.origin,
    );
    return NextResponse.json({ error: "Missing JWT" }, { status: 401 });
  }

  // Step 1: JWT Verification (separate error handling)
  let payload;
  let privyUserId;
  try {
    payload = await verifyPrivyJWT(token);
    privyUserId = payload.sub;

    if (!privyUserId) {
      const responseTime = Date.now() - startTime;
      trackMiddlewareAnalytics(
        "error",
        {
          endpoint,
          method,
          statusCode: 401,
          errorMessage: "Invalid JWT: Missing subject",
          properties: {
            middleware: true,
            error_type: "jwt_missing_subject",
          },
        },
        req.nextUrl.origin,
      );
      return NextResponse.json(
        { error: "Invalid JWT: Missing subject" },
        { status: 401 },
      );
    }
  } catch (jwtError) {
    const responseTime = Date.now() - startTime;
    console.error("JWT verification error in middleware:", jwtError);
    trackMiddlewareAnalytics(
      "error",
      {
        endpoint,
        method,
        statusCode: 401,
        errorMessage:
          jwtError instanceof Error ? jwtError.message : "Unknown JWT error",
        properties: {
          middleware: true,
          error_type: "jwt_verification_failed",
        },
      },
      req.nextUrl.origin,
    );
    return NextResponse.json({ error: "Invalid JWT" }, { status: 401 });
  }

  // Step 2: Wallet Resolution (separate error handling)
  let walletAddress;
  try {
    walletAddress = await getWalletAddressFromPrivyUserId(privyUserId);

    if (!walletAddress) {
      const responseTime = Date.now() - startTime;
      trackMiddlewareAnalytics(
        "error",
        {
          endpoint,
          method,
          statusCode: 502,
          errorMessage: "Unable to resolve wallet address",
          properties: {
            middleware: true,
            error_type: "wallet_resolution_failed",
            privy_user_id: privyUserId,
          },
        },
        req.nextUrl.origin,
      );
      return NextResponse.json(
        { error: "Unable to resolve wallet address" },
        { status: 502 },
      );
    }
  } catch (walletError) {
    const responseTime = Date.now() - startTime;
    console.error("Wallet resolution error in middleware:", walletError);
    trackMiddlewareAnalytics(
      "error",
      {
        endpoint,
        method,
        statusCode: 502,
        errorMessage:
          walletError instanceof Error
            ? walletError.message
            : "Unknown wallet error",
        properties: {
          middleware: true,
          error_type: "wallet_resolution_failed",
          privy_user_id: privyUserId,
        },
      },
      req.nextUrl.origin,
    );
    return NextResponse.json(
      { error: "Unable to resolve wallet address" },
      { status: 502 },
    );
  }

  // Step 3: Set wallet context (improved error handling)
  const setWalletContext = async () => {
    const internalAuth = process.env.INTERNAL_API_KEY;
    if (!internalAuth) {
      console.warn(
        "INTERNAL_API_KEY not configured, skipping wallet context setting",
      );
      return;
    }

    // Fire-and-forget is best moved to a route handler using after().
    // If kept, prefer same-origin and gate behind a flag.
    if (process.env.ENABLE_WALLET_CONTEXT_SYNC === "true") {
      const url = new URL(
        "/api/internal/set-wallet-context",
        req.nextUrl.origin,
      );
      // Note: still not guaranteed to complete in middleware.
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-auth": internalAuth,
        },
        body: JSON.stringify({ walletAddress }),
      }).catch((error) => {
        console.warn("Failed to set wallet context:", error);
      });
    }
  };

  // Execute wallet context setting (non-blocking but with proper error handling)
  setWalletContext().catch((error) => {
    console.error("Unhandled error in wallet context setting:", error);
  });

  // Step 4: Create response with proper headers
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-wallet-address", walletAddress);
  requestHeaders.set("x-user-id", privyUserId);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Only set x-wallet-address and x-user-id header for internal/authorized requests
  // This prevents identifier leakage to external clients
  const isInternalRequest = isInternalOrAuthorizedRequest(req);
  if (isInternalRequest) {
    response.headers.set("x-wallet-address", walletAddress);
    response.headers.set("x-user-id", privyUserId);
  }

  // Track successful response for analytics
  const responseTime = Date.now() - startTime;
  trackMiddlewareAnalytics(
    "response",
    {
      endpoint,
      method,
      statusCode: 200,
      responseTime,
      properties: {
        middleware: true,
        wallet_address: walletAddress,
        privy_user_id: privyUserId,
      },
    },
    req.nextUrl.origin,
  );

  return response;
}

export default authorizationMiddleware;

export const config = {
  matcher: [
    "/api/v1/transactions",
    "/api/v1/transactions/:path*",
    "/api/v1/account/verify",
    "/api/v1/account/:path*",
    "/api/v1/recipients",
    "/api/blockfest/cashback",
    // (optional) add other instrumented API routes:
    // '/api/v1/kyc/:path*', '/api/v1/rates', '/api/v1/rates/:path*'
  ],
};
