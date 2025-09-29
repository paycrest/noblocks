import { NextRequest, NextResponse } from "next/server";
import { trackApiRequest, trackApiResponse, trackApiError } from "@/app/lib/server-analytics";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, ...data } = body;

    switch (type) {
      case "request":
        trackApiRequest(request, data.endpoint, data.method, data.properties);
        break;
      case "response":
        trackApiResponse(data.endpoint, data.method, data.statusCode, data.responseTime, data.properties);
        break;
      case "error":
        trackApiError(request, data.endpoint, data.method, new Error(data.errorMessage), data.statusCode, data.properties);
        break;
      default:
        return NextResponse.json({ error: "Invalid analytics type" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Middleware analytics error:", error);
    return NextResponse.json({ error: "Analytics tracking failed" }, { status: 500 });
  }
}
