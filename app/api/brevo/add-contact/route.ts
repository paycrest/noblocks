import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { brevoConfig } from "@/app/lib/server-config";
import axios from "axios";

// POST /api/brevo/add-contact
// Body: { email: string }
export const POST = withRateLimit(async (request: NextRequest) => {
  const start = Date.now();
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { success: false, error: "Unsupported content type" },
        { status: 415 },
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body.email !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const email = String(body.email).trim().toLowerCase();

    // Basic email validation
    // RFC 5321 caps email at 320 chars (64 local + @ + 255 domain)
    if (email.length > 320) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 },
      );
    }

    if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 },
      );
    }

    // Check if Brevo is configured
    if (!brevoConfig.apiKey || !brevoConfig.listId) {
      console.error("Brevo not configured: missing API key or list ID");
      return NextResponse.json(
        { success: false, error: "Email service not configured" },
        { status: 500 },
      );
    }

    // Validate list ID is a valid integer
    const listId = parseInt(brevoConfig.listId, 10);
    if (isNaN(listId) || !Number.isInteger(listId)) {
      console.error(
        "Brevo misconfigured: invalid list ID:",
        brevoConfig.listId,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Email service misconfigured: invalid Brevo list ID",
        },
        { status: 500 },
      );
    }

    // Call Brevo API
    const brevoResponse = await axios.post(
      "https://api.brevo.com/v3/contacts",
      {
        email,
        listIds: [listId],
        updateEnabled: true, // Update contact if already exists
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": brevoConfig.apiKey,
        },
        validateStatus: (status) => {
          // Brevo returns 201 for new contact, 204 for updated contact, 200 for some scenarios
          return status === 200 || status === 201 || status === 204;
        },
        timeout: 5000, // 5 second timeout to prevent hanging
      },
    );

    return NextResponse.json({
      success: true,
      response_time_ms: Date.now() - start,
    });
  } catch (err) {
    // Sanitize error logging to avoid leaking API key
    if (axios.isAxiosError(err) && err.response) {
      console.error("Brevo API error:", {
        message: err.message,
        status: err.response.status,
        statusText: err.response.statusText,
        data: err.response.data,
        // Avoid logging err.config or err.config.headers (contains API key)
      });

      // Return generic message to client
      return NextResponse.json(
        {
          success: false,
          error: "Failed to add contact to list",
          response_time_ms: Date.now() - start,
        },
        { status: err.response.status },
      );
    }

    // Log non-Axios errors safely
    console.error(
      "Brevo add-contact API error:",
      err instanceof Error ? err.message : String(err),
    );

    // Generic error for client
    return NextResponse.json(
      {
        success: false,
        error: "Failed to add contact to list",
        response_time_ms: Date.now() - start,
      },
      { status: 500 },
    );
  }
});
