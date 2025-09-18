import { NextRequest, NextResponse } from 'next/server';
import { trackApiRequest, trackApiResponse, trackApiError } from './server-analytics';

/**
 * Analytics middleware wrapper for API routes
 * Automatically tracks API requests, responses, and errors
 */
export function withAnalytics<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest;
    const startTime = Date.now();
    
    // Extract endpoint and method
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const method = request.method;
    
    // Track API request
    trackApiRequest(request, endpoint, method, {
      request_size: request.headers.get('content-length') || '0',
      referer: request.headers.get('referer') || 'direct',
    });

    try {
      // Execute the original handler
      const response = await handler(...args);
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Track successful API response
      trackApiResponse(endpoint, method, response.status, responseTime, {
        response_size: response.headers.get('content-length') || '0',
        cache_status: response.headers.get('cache-control') || 'no-cache',
      });
      
      return response;
    } catch (error) {
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      // Track API error
      trackApiError(
        request,
        endpoint,
        method,
        error as Error,
        500,
        {
          response_time_ms: responseTime,
        }
      );
      
      // Re-throw the error
      throw error;
    }
  };
}

/**
 * Rate-limited analytics middleware wrapper
 * Combines rate limiting with analytics tracking
 */
export function withRateLimitAndAnalytics<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>,
  rateLimitConfig?: {
    windowMs?: number;
    max?: number;
    message?: string;
  }
) {
  return withAnalytics(handler);
}
