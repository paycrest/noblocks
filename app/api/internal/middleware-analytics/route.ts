import { NextRequest, NextResponse } from "next/server";
import { trackApiRequest, trackApiResponse, trackApiError } from "@/app/lib/server-analytics";

export async function POST(request: NextRequest) {
  // Security guard: Verify internal authentication
  const internalAuth = request.headers.get("x-internal-auth");
  const expectedAuth = process.env.INTERNAL_API_KEY;
  
  if (!internalAuth || !expectedAuth || internalAuth !== expectedAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, ...data } = body;

    // Validate analytics type
    if (!["request", "response", "error"].includes(type)) {
      return NextResponse.json({ error: "Invalid analytics type" }, { status: 400 });
    }

    // Create sanitized request object to prevent sensitive data exposure
    const SENSITIVE = new Set(["authorization", "cookie", "x-internal-auth", "set-cookie", "x-api-key", "proxy-authorization"]);
    const safeHeaders = Object.fromEntries(
      [...request.headers].filter(([k]) => !SENSITIVE.has(k.toLowerCase()))
    );

    // Create sanitized mock request object
    const sanitizedRequest = {
      method: request.method,
      url: `https://example.com${request.nextUrl.pathname}`,
      nextUrl: {
        pathname: request.nextUrl.pathname,
      },
      headers: {
        get: (name: string) => safeHeaders[name.toLowerCase()] || null,
        entries: () => Object.entries(safeHeaders),
      },
    } as unknown as NextRequest;

    // Handle tracking with proper error handling
    try {
      switch (type) {
        case "request": {
          trackApiRequest(sanitizedRequest, data.endpoint, data.method, data.properties);
          break;
        }
        case "response": {
          trackApiResponse(data.endpoint, data.method, data.statusCode, data.responseTime, data.properties);
          break;
        }
        case "error": {
          const err = new Error(String(data.errorMessage ?? "Unknown error"));
          trackApiError(sanitizedRequest, data.endpoint, data.method, err, data.statusCode, data.properties);
          break;
        }
      }
    } catch (trackingError) {
      console.error("Analytics tracking failed:", trackingError);
      // Don't throw - analytics failures shouldn't break the API
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Middleware analytics error:", error);
    return NextResponse.json({ error: "Analytics tracking failed" }, { status: 500 });
  }
}
