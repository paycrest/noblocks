import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import { getEmailForMonitoredAddress } from "@/app/utils";
import config from "@/app/lib/config";
import { createKycReporter } from "@/app/lib/kyc-telemetry";

/**
 * Fires the Tier 1 "verify your phone to start swapping" email (Activepieces → Brevo)
 * once, right after a new email signup. The wallet and email are resolved from the
 * authenticated Privy session (middleware-injected `x-wallet-address`), never from the
 * request body, so the endpoint can't be used to email arbitrary addresses.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();
  // The nudge that starts tier 1. When it silently fails the user is never
  // told to verify their phone, and nothing else reports it.
  const report = createKycReporter({ step: "signup_email", targetTier: 1 });
  // Read outside the try so the catch below can still name the user. The
  // header is set by the middleware and reading it cannot throw.
  const walletAddress = request.headers.get("x-wallet-address");

  try {
    trackApiRequest(request, "/api/kyc/signup-email", "POST");

    if (!walletAddress) {
      report.rejected({ reason: "unauthorized", statusCode: 401 });
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
      report.failed({
        walletAddress,
        stage: "signup_email_dispatch",
        reason: "missing_webhook_config",
        detail: "ACTIVEPIECES_SIGNUP_VERIFY_WEBHOOK_URL is not set",
        statusCode: 200,
      });
      return NextResponse.json({ success: true, skipped: true });
    }

    // Resolve the email from the authenticated identity (defense in depth);
    // wallet/passkey signups without an email are silently skipped.
    const email = await getEmailForMonitoredAddress(walletAddress);
    if (!email) {
      // Wallet and passkey signups have no email — expected, not a failure.
      report.noop({
        walletAddress,
        stage: "signup_email_dispatch",
        reason: "no_email_on_identity",
        statusCode: 200,
      });
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
        // Don't fold the upstream body into the error: Activepieces can echo the
        // submitted email/wallet, which would leak PII into server logs.
        throw new Error(
          `Activepieces signup webhook ${res.status} ${res.statusText}`.trim(),
        );
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/kyc/signup-email", "POST", 200, responseTime);
    report.success({
      walletAddress,
      stage: "signup_email_dispatch",
      statusCode: 200,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    // Covers the webhook's own non-2xx, which is thrown above.
    report.failed({
      walletAddress,
      stage: "signup_email_dispatch",
      reason: "webhook_failed",
      detail: error instanceof Error ? error.message : String(error),
      error,
      statusCode: 500,
    });
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
