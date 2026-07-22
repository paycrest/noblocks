import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";

// Inline lightweight edge-compatible helpers to avoid pulling in heavy SDKs

const _appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const _appSecret = process.env.PRIVY_APP_SECRET;

if (!_appId || !_appSecret) {
  throw new Error(
    "Missing required env vars: NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET must be set",
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
    audience: PRIVY_APP_ID,
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

  // Return 404 for referral routes when the feature is disabled
  if (
    (endpoint === "/api/referral" || endpoint.startsWith("/api/referral/")) &&
    process.env.NEXT_PUBLIC_REFERRAL_ENABLED?.trim().toLowerCase() === "false"
  ) {
    return NextResponse.json(
      { success: false, error: "Referral program is disabled" },
      { status: 404 },
    );
  }

  // Return 404 for Noblocks Play routes when the feature is disabled
  const isPlayRoute = endpoint === "/api/play" || endpoint.startsWith("/api/play/");
  if (isPlayRoute && process.env.NEXT_PUBLIC_FANTASY_ENABLED !== "true") {
    return NextResponse.json(
      { success: false, error: "Noblocks Play is not available" },
      { status: 404 },
    );
  }

  // Noblocks Play routes that manage their own auth (public reads, the
  // worker's internal secret, the admin key) skip the Privy JWT requirement
  // below - they only need the feature-flag gate above.
  const isPlaySelfAuthedRoute =
    endpoint === "/api/play/leaderboard" ||
    endpoint === "/api/play/players" ||
    endpoint === "/api/play/matchdays" ||
    endpoint.startsWith("/api/play/matchday/") ||
    endpoint === "/api/play/og" ||
    endpoint === "/api/play/worker" ||
    endpoint.startsWith("/api/play/admin/");
  if (isPlaySelfAuthedRoute) {
    return NextResponse.next();
  }

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

// --- Embeddable widget (/widget) ---
// Origins allowed to iframe /widget. Env base (EMBED_ALLOWED_ORIGINS) merged
// with the embed_allowed_origins table via the internal API, cached in module
// scope. frame-ancestors accepts wildcard subdomains (https://*.partner.com).
// HTTPS is required for partner origins (a network attacker could tamper with
// an http:// parent page and drive the framed widget); http:// is permitted
// only for localhost/127.0.0.1 during development.
const EMBED_ORIGIN_RE =
  /^https:\/\/(\*\.)?[\w.-]+(:\d+)?$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const EMBED_ORIGINS_TTL_MS = 5 * 60_000;
let embedOriginsCache: { origins: string[]; fetchedAt: number } | null = null;

function envEmbedOrigins(): string[] {
  return (process.env.EMBED_ALLOWED_ORIGINS ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((o) => EMBED_ORIGIN_RE.test(o));
}

async function getEmbedAllowedOrigins(): Promise<string[]> {
  const now = Date.now();
  const stale =
    !embedOriginsCache || now - embedOriginsCache.fetchedAt >= EMBED_ORIGINS_TTL_MS;
  if (stale) {
    const internalAuth = process.env.INTERNAL_API_KEY;
    // Only fetch the DB-backed allowlist through a trusted, configured base
    // URL — never a request-derived (Host-header-controlled) origin, which a
    // poisoned host could point at an attacker's server to steal the internal
    // key and poison this shared cache. If unconfigured, use the env allowlist
    // only. See INTERNAL_API_BASE_URL in .env.example.
    const baseUrl = process.env.INTERNAL_API_BASE_URL;
    if (internalAuth && baseUrl) {
      try {
        const res = await fetch(`${baseUrl}/api/internal/embed-origins`, {
          headers: { "x-internal-auth": internalAuth },
        });
        if (res.ok) {
          const { origins } = (await res.json()) as { origins?: string[] };
          embedOriginsCache = {
            origins: (origins ?? []).filter((o) => EMBED_ORIGIN_RE.test(o)),
            fetchedAt: now,
          };
        } else {
          // Fail closed: drop DB-backed origins on a bad refresh so a revoked
          // partner can't keep framing during an outage. Env allowlist stays.
          embedOriginsCache = null;
        }
      } catch {
        embedOriginsCache = null;
      }
    }
  }
  return [...new Set([...envEmbedOrigins(), ...(embedOriginsCache?.origins ?? [])])];
}

async function embedMiddleware(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_EMBED_ENABLED !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const origins = await getEmbedAllowedOrigins();

  // Cookieless source-domain attribution: the Referer of an iframe's first
  // load is the embedding page.
  const referer = req.headers.get("referer");
  let referrerOrigin = "";
  try {
    referrerOrigin = referer ? new URL(referer).origin : "";
  } catch {
    // Malformed referer - skip attribution detail.
  }
  if (referrerOrigin && referrerOrigin !== req.nextUrl.origin) {
    trackMiddlewareAnalytics(
      "request",
      {
        endpoint: "/widget",
        method: req.method,
        properties: {
          middleware: true,
          embed: true,
          referrer_origin: referrerOrigin,
        },
      },
      req.nextUrl.origin,
    );
  }

  const response = NextResponse.next();
  // frame-ancestors supersedes X-Frame-Options; delete it as belt-and-braces
  // (next.config.mjs already scopes DENY away from /widget).
  response.headers.delete("x-frame-options");
  response.headers.set(
    "Content-Security-Policy",
    origins.length
      ? `frame-ancestors 'self' ${origins.join(" ")}`
      : "frame-ancestors 'none'",
  );
  return response;
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname === "/widget" || pathname.startsWith("/widget/")) {
    return embedMiddleware(req);
  }
  return authorizationMiddleware(req);
}

export const config = {
  matcher: [
    "/widget",
    "/widget/:path*",
    "/api/v1/transactions",
    "/api/v1/transactions/:path*",
    "/api/v1/account/verify",
    "/api/v1/account/:path*",
    "/api/v1/recipients",
    "/api/v1/refund-account",
    "/api/v1/payment-orders",
    "/api/v1/payment-orders/:path*",
    "/api/v1/wallets/moralis-stream/register",
    "/api/blockfest/cashback",
    "/api/kyc/smile-id",
    "/api/kyc/status",
    "/api/kyc/transaction-summary",
    "/api/kyc/tier3-verify",
    "/api/kyc/signup-email",
    "/api/phone/send-otp",
    "/api/phone/verify-otp",
    "/api/bundler",
    "/api/bundler/:path*",
    "/api/bridge/:path*",
    "/api/starknet/transfer",
    "/api/starknet/create-order",
    "/api/referral",
    "/api/referral/:path*",
    "/api/play/join",
    "/api/play/squad",
    "/api/play/transfers",
    "/api/play/captain",
    "/api/play/rewards",
    "/api/play/opt-in",
    "/api/play/username/:path*",
    "/api/play/leaderboard",
    "/api/play/players",
    "/api/play/matchdays",
    "/api/play/matchday/:path*",
    "/api/play/og",
    "/api/play/worker",
    "/api/play/admin/:path*",
    // (optional) add other instrumented API routes:
    // '/api/v1/kyc/:path*', '/api/v1/rates', '/api/v1/rates/:path*'
  ],
};
