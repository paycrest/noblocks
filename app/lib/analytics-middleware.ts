import type { NextRequest } from "next/server";
import { trackApiRequest, trackApiResponse, trackApiError } from "./server-analytics";
import { withRateLimit, type RouteHandler } from "./rate-limit";

export type { RouteHandler } from "./rate-limit";

/**
 * Analytics middleware wrapper for API routes
 * Automatically tracks API requests, responses, and errors
 */
export function withAnalytics<TContext>(
  handler: RouteHandler<TContext>,
): RouteHandler<TContext> {
  return async (request: NextRequest, context: TContext): Promise<Response> => {
    const startTime = Date.now();

    const url = new URL(request.url);
    const endpoint = url.pathname;
    const method = request.method;

    trackApiRequest(request, endpoint, method, {
      request_size: request.headers.get("content-length") || "0",
      referer: request.headers.get("referer") || "direct",
    });

    try {
      const response = await handler(request, context);

      trackApiResponse(endpoint, method, response.status, Date.now() - startTime, {
        response_size: response.headers.get("content-length") || "0",
        cache_status: response.headers.get("cache-control") || "no-cache",
      });

      return response;
    } catch (error) {
      trackApiError(
        request,
        endpoint,
        method,
        error instanceof Error ? error : new Error(String(error)),
        500,
        {
          response_time_ms: Date.now() - startTime,
        },
      );
      throw error;
    }
  };
}

/**
 * Rate-limited analytics middleware wrapper
 * Combines rate limiting with analytics tracking
 */
export function withRateLimitAndAnalytics<TContext>(
  handler: RouteHandler<TContext>,
): RouteHandler<TContext> {
  // Analytics outermost so 429 responses are tracked as API Response.
  return withAnalytics(withRateLimit(handler));
}
