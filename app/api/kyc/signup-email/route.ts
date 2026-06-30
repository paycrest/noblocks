import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import { getEmailForMonitoredAddress } from "@/app/utils";
import config from "@/app/lib/config";

/**
 * Fires the Tier 1 "verify your phone to start swapping" email (Activepieces → Brevo)
 * once, right after a new email signup. The wallet and email are resolved from the
 * authenticated Privy session (middleware-injected `x-wallet-address`), never from the
 * request body, so the endpoint can't be used to email arbitrary addresses.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    trackApiRequest(request, "/api/kyc/signup-email", "POST");

    const walletAddress = request.headers.get("x-wallet-address");
    if (!walletAddress) {
      trackApiError(
        request,
        "/api/kyc/signup-email",
        "POST",
        new Error("Unauthorized"),
        401,
      );
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const webhookUrl = config.activepiecesSignupVerifyWebhookUrl;
    if (!webhookUrl) {
      console.error(
        "[activepieces] ACTIVEPIECES_SIGNUP_VERIFY_WEBHOOK_URL not set — skipping signup email",
      );
      return NextResponse.json({ success: true, skipped: true });
    }

    // Resolve the email from the authenticated identity (defense in depth);
    // wallet/passkey signups without an email are silently skipped.
    const email = await getEmailForMonitoredAddress(walletAddress);
    if (!email) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const timeoutMs = 10_000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "signup_verify_phone",
          email,
          wallet: walletAddress.toLowerCase(),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Activepieces signup webhook ${res.status} ${body.slice(0, 200)}`.trim(),
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/kyc/signup-email", "POST", 200, responseTime);
    return NextResponse.json({ success: true });
  } catch (error) {
    trackApiError(
      request,
      "/api/kyc/signup-email",
      "POST",
      error as Error,
      500,
    );
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
