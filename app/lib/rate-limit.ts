import { NextRequest, NextResponse } from 'next/server';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 60, // Per minute
  blockDuration: 60, // Block for 1 minute if limit exceeded
});

export async function rateLimit(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'anonymous';

    const rateLimitResult = await rateLimiter.consume(ip);

    return {
      success: true,
      remaining: rateLimitResult.remainingPoints,
      reset: Math.ceil(rateLimitResult.msBeforeNext / 1000)
    };
  } catch (error) {
    if (error instanceof Error) {
      // Rate limit exceeded
      return {
        success: false,
        remaining: 0,
        reset: 60
      };
    }

    // If rate limiting fails, allow the request
    return { success: true };
  }
}

// Middleware wrapper for API routes
export function withRateLimit(handler: Function) {
  return async (request: NextRequest) => {
    const limiter = await rateLimit(request);

    if (!limiter.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests'
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': limiter.remaining?.toString() ?? '0',
            'X-RateLimit-Reset': (limiter.reset || 60).toString()
          }
        }
      );
    }

    return handler(request);
  };
}