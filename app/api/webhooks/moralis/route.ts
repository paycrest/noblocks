import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { verifyMoralisSignature } from "@/app/lib/moralis-webhook";
import {
  processMoralisDepositPayload, 
} from "@/app/lib/moralis-deposit-processing";
import config from "@/app/lib/config";
import { MoralisWebhookBody } from "@/app/types";

/**
 * Moralis Streams → verify signature → (after response) map `to` → Privy email → Activepieces → Brevo.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const secret = config.moralisWebhookSecret;
  const sig = request.headers.get("x-signature");

  if (secret) {
    if (!verifyMoralisSignature(raw, sig, secret)) {
      console.warn("[moralis webhook] invalid or missing x-signature");
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "development") {
    console.warn(
      "[moralis webhook] MORALIS_WEBHOOK_SECRET not set — skipping x-signature (local only)",
    );
  } else {
    console.warn(
      "[moralis webhook] MORALIS_WEBHOOK_SECRET not set — set in production for security",
    );
  }

  let body: MoralisWebhookBody;
  try {
    body = JSON.parse(raw) as MoralisWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
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

  return NextResponse.json(
    { ok: true, receivedAt: new Date().toISOString() },
    { status: 200 },
  );
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "moralis-webhook",
      post: "POST with Moralis stream payload; MORALIS_WEBHOOK_SECRET; ACTIVEPIECES_WEBHOOK_URL",
    },
    { status: 200 },
  );
}
