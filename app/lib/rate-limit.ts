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
      reset: Math.ceil(rateLimitResult.msBeforeNext / 1000),
    };
  } catch (error) {
    return {
      success: false,
      remaining: 0,
      reset: 60,
    };
  }
}

export function withRateLimit(handler: Function) {
  return async (request: NextRequest) => {
    const limiter = await rateLimit(request);

    const headers = {
      'X-RateLimit-Remaining': limiter.remaining.toString(),
      'X-RateLimit-Reset': limiter.reset.toString(),
    };

    if (!limiter.success) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429, headers }
      );
    }

    const response = await handler(request);
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  };
}