import { NextRequest, NextResponse } from "next/server";
import { RateLimiterMemory } from "rate-limiter-flexible";

/**
 * App Router route handler. Generic over the context arg so dynamic segments
 * ([id], [address]) keep their own `{ params }` type through the wrappers —
 * parameters are contravariant, so a non-generic `context?: unknown` would
 * reject every typed handler.
 */
export type RouteHandler<TContext = unknown> = (
  request: NextRequest,
  context: TContext,
) => Promise<Response>;

/**
 * Per-caller budget. Keyed on middleware-verified x-wallet-address when present
 * (set only after Privy JWT or injected-session verification). Never use
 * x-user-id — it is forgeable on routes that skip JWT auth.
 */
const identityLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 60, // Per minute
  blockDuration: 60, // Block for 1 minute if limit exceeded
});

/**
 * Per-IP ceiling, always applied. Sized to fit a NAT'd cohort at normal poll
 * rates, not a scraper.
 */
const ipLimiter = new RateLimiterMemory({
  points: 300,
  duration: 60,
  blockDuration: 60,
});

/** First x-forwarded-for hop is the client; later entries are proxies. */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "anonymous";
}

export async function rateLimit(request: NextRequest) {
  const ip = clientIp(request);
  const verifiedWallet = request.headers.get("x-wallet-address")?.trim().toLowerCase();
  const identityKey = verifiedWallet ? `wallet:${verifiedWallet}` : `ip:${ip}`;

  try {
    const ipResult = await ipLimiter.consume(ip);
    try {
      const identityResult = await identityLimiter.consume(identityKey);
      return {
        success: true,
        remaining: identityResult.remainingPoints,
        reset: Math.ceil(identityResult.msBeforeNext / 1000),
      };
    } catch (identityError) {
      await ipLimiter.reward(ip);
      throw identityError;
    }
  } catch {
    return {
      success: false,
      remaining: 0,
      reset: 60,
    };
  }
}

export function withRateLimit<TContext>(
  handler: RouteHandler<TContext>,
): RouteHandler<TContext> {
  return async (request: NextRequest, context: TContext) => {
    const limiter = await rateLimit(request);

    const headers = {
      "X-RateLimit-Remaining": limiter.remaining.toString(),
      "X-RateLimit-Reset": limiter.reset.toString(),
    };

    if (!limiter.success) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers },
      );
    }

    const response = await handler(request, context);

    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }

    return response;
  };
}
