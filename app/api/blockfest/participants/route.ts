import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  isValidEvmAddress,
  isValidEmailWithLength,
} from "@/app/lib/validation";

// POST /api/blockfest/participants
// Body: { walletAddress: string, email?: string, source?: string }
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

    if (!body || typeof body.walletAddress !== "string") {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const walletAddress = String(body.walletAddress).trim().toLowerCase();
    const emailRaw = body.email ? String(body.email).trim() : null;
    const sourceRaw = body.source ? String(body.source).trim() : "modal";

    // Basic EVM address validation
    if (!isValidEvmAddress(walletAddress)) {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address format" },
        { status: 400 },
      );
    }

    // Validate email format if provided
    if (emailRaw && !isValidEmailWithLength(emailRaw)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 },
      );
    }

    // Validate source field length (max 100 chars)
    if (sourceRaw.length > 100) {
      return NextResponse.json(
        {
          success: false,
          error: "Source field exceeds maximum length of 100 characters",
        },
        { status: 400 },
      );
    }
    const source = sourceRaw;
    const email = emailRaw;

    // Upsert participant (idempotent)
    // normalized_address is auto-populated by trigger from wallet_address
    const { error } = await supabaseAdmin.from("blockfest_participants").upsert(
      {
        wallet_address: walletAddress,
        email,
        source,
      },
      { onConflict: "normalized_address" },
    );

    if (error) {
      console.error("Supabase upsert error (blockfest_participants):", error);
      return NextResponse.json(
        {
          success: false,
          error: "Failed to save participant",
          response_time_ms: Date.now() - start,
        },
        { status: 500 },
      );
    }

    // Non-blocking Brevo sync - only if email is provided
    if (email) {
      Promise.allSettled([
        fetch(`${request.nextUrl.origin}/api/brevo/add-contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).then((res) => {
          if (!res.ok) {
            throw new Error(`Brevo sync failed: ${res.status}`);
          }
          return res.json();
        }),
      ])
        .then((results) => {
          results.forEach((result) => {
            if (result.status === "rejected") {
              console.error("Background Brevo sync failed:", result.reason);
            }
          });
        })
        .catch((err) => {
          console.error("Unexpected error in Brevo background task:", err);
        });
    }

    return NextResponse.json({
      success: true,
      response_time_ms: Date.now() - start,
    });
  } catch (err) {
    console.error("BlockFest participants API error:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Internal Server Error",
        response_time_ms: Date.now() - start,
      },
      { status: 500 },
    );
  }
});
