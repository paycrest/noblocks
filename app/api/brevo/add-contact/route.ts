import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import { brevoConfig } from "@/app/lib/config";
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

    // Call Brevo API
    const brevoResponse = await axios.post(
      "https://api.brevo.com/v3/contacts",
      {
        email,
        listIds: [parseInt(brevoConfig.listId)],
        updateEnabled: true, // Update contact if already exists
      },
      {
        headers: {
          "Content-Type": "application/json",
          "api-key": brevoConfig.apiKey,
        },
        validateStatus: (status) => {
          // Brevo returns 201 for new contact, 204 for updated contact
          return status === 200 || status === 201 || status === 204;
        },
      },
    );

    return NextResponse.json({
      success: true,
      response_time_ms: Date.now() - start,
    });
  } catch (err) {
    console.error("Brevo add-contact API error:", err);

    // Handle axios errors
    if (axios.isAxiosError(err) && err.response) {
      const errorMessage =
        err.response.data?.message || "Failed to add contact to list";
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          response_time_ms: Date.now() - start,
        },
        { status: err.response.status },
      );
    }

    const message =
      err instanceof Error && err.message
        ? err.message
        : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message, response_time_ms: Date.now() - start },
      { status: 500 },
    );
  }
});
