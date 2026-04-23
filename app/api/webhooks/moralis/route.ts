import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/app/lib/rate-limit";
import {
  trackApiRequest,
  trackApiResponse,
  trackApiError,
} from "@/app/lib/server-analytics";
import { verifyMoralisSignature } from "@/app/lib/moralis-webhook";
import { processMoralisDepositPayload } from "@/app/lib/moralis-deposit-processing";
import config from "@/app/lib/config";
import type { MoralisWebhookBody } from "@/app/types";

/**
 * Moralis Streams → verify signature → (after response) map `to` → Privy email → Activepieces → Brevo.
 */
export const dynamic = "force-dynamic";

export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    trackApiRequest(request, "/api/webhooks/moralis", "POST", {
      integration: "moralis_streams",
    });

    const raw = await request.text();
    const secret = config.moralisWebhookSecret;
    const sig = request.headers.get("x-signature");

    if (secret) {
      if (!verifyMoralisSignature(raw, sig, secret)) {
        console.warn("[moralis webhook] invalid or missing x-signature");
        trackApiError(
          request,
          "/api/webhooks/moralis",
          "POST",
          new Error("Invalid or missing signature"),
          401,
        );
        return NextResponse.json(
          { success: false, error: "Invalid or missing signature" },
          { status: 401 },
        );
      }
    } else if (process.env.NODE_ENV === "development") {
      console.warn(
        "[moralis webhook] MORALIS_WEBHOOK_SECRET not set — skipping x-signature (local only)",
      );
    } else {
      console.error(
        "[moralis webhook] MORALIS_WEBHOOK_SECRET not set — rejecting request in production",
      );
      trackApiError(
        request,
        "/api/webhooks/moralis",
        "POST",
        new Error("MORALIS_WEBHOOK_SECRET not set in production"),
        503,
      );
      return NextResponse.json(
        { success: false, error: "Email webhook not configured" },
        { status: 503 },
      );
    }

    let body: MoralisWebhookBody;
    try {
      body = JSON.parse(raw) as MoralisWebhookBody;
    } catch {
      trackApiError(
        request,
        "/api/webhooks/moralis",
        "POST",
        new Error("Invalid JSON body"),
        400,
      );
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.log(
        "[moralis webhook] confirmed=%s chainId=%s txs=%d erc20=%d",
        String(body.confirmed),
        body.chainId || "(empty)",
        body.txs?.length ?? 0,
        body.erc20Transfers?.length ?? 0,
      );
    } else {
      console.log("[moralis webhook] received bytes=%d", raw.length);
    }

    after(() => {
      void processMoralisDepositPayload(body).catch((err) => {
        console.error("[moralis webhook] processMoralisDepositPayload", err);
      });
    });

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/webhooks/moralis", "POST", 200, responseTime, {
      integration: "moralis_streams",
      chain_id: body.chainId || "",
    });

    return NextResponse.json({
      success: true,
      message: "Webhook received",
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[moralis webhook] POST error:", error);

    const responseTime = Date.now() - startTime;
    trackApiError(
      request,
      "/api/webhooks/moralis",
      "POST",
      error instanceof Error ? error : new Error(String(error)),
      500,
      { response_time_ms: responseTime },
    );

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      service: "moralis-webhook",
      post:
        "POST with Moralis stream JSON body; set MORALIS_WEBHOOK_SECRET and ACTIVEPIECES_WEBHOOK_URL in production",
    },
    { status: 200 },
  );
}
