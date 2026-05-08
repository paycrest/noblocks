import { NextRequest, NextResponse } from "next/server";
import { verifyJWT } from "@/app/lib/jwt";
import { DEFAULT_PRIVY_CONFIG } from "@/app/lib/config";
import { getPrivyClient } from "@/app/lib/privy";
import { withRateLimit } from "@/app/lib/rate-limit";
import { generateAuthorizationSignature } from "@privy-io/server-auth/wallet-api";
import {
  trackApiError,
  trackApiRequest,
  trackApiResponse,
} from "@/app/lib/server-analytics";

const PRIVY_WALLET_API = process.env.PRIVY_WALLET_API_URL || "https://api.privy.io";

type ExportBody = {
  recipientPublicKey: string;
  walletId: string;
};

/**
 * POST /api/starknet/export-wallet
 * Proxies Privy HPKE export for the authenticated user's Starknet embedded wallet.
 * Plaintext private key is assembled only on the client after decryption.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      trackApiError(
        request,
        "/api/starknet/export-wallet",
        "POST",
        new Error("Missing or invalid authorization header"),
        401,
      );
      return NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 },
      );
    }

    const userJwt = authHeader.substring(7);
    const { payload } = await verifyJWT(userJwt, DEFAULT_PRIVY_CONFIG);
    const authUserId = payload.sub || payload.userId;

    if (!authUserId) {
      trackApiError(
        request,
        "/api/starknet/export-wallet",
        "POST",
        new Error("Invalid token: missing user ID"),
        401,
      );
      return NextResponse.json(
        { error: "Invalid token: missing user ID" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as ExportBody;
    const { recipientPublicKey, walletId } = body;

    if (!recipientPublicKey || !walletId) {
      return NextResponse.json(
        { error: "recipientPublicKey and walletId are required" },
        { status: 400 },
      );
    }

    trackApiRequest(request, "/api/starknet/export-wallet", "POST", {
      privy_user_id: authUserId,
    });

    const privy = getPrivyClient();
    const user = await privy.getUser(authUserId);
    const linkedAccounts = user.linkedAccounts || [];
    const ownsStarknetWallet = linkedAccounts.some((account) => {
      const a = account as {
        id?: string | null;
        type?: string;
        chainType?: string;
        chain_type?: string;
      };
      return (
        a.id === walletId &&
        a.type === "wallet" &&
        (a.chainType === "starknet" || a.chain_type === "starknet")
      );
    });

    if (!ownsStarknetWallet) {
      trackApiError(
        request,
        "/api/starknet/export-wallet",
        "POST",
        new Error("Unauthorized: Starknet wallet does not belong to this user"),
        403,
      );
      return NextResponse.json(
        { error: "Unauthorized: wallet does not belong to this user" },
        { status: 403 },
      );
    }

    const wallet = await privy.walletApi.getWallet({ id: walletId });
    if (String(wallet.chainType).toLowerCase() !== "starknet") {
      return NextResponse.json(
        { error: "Wallet is not a Starknet wallet" },
        { status: 400 },
      );
    }

    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const url = `${PRIVY_WALLET_API}/v1/wallets/${walletId}/export`;
    // Privy REST only accepts encryption_type + recipient_public_key (see WalletExportRequestBody).
    // authorization_context is for the Node SDK, not this JSON body.
    const exportBody = {
      encryption_type: "HPKE" as const,
      recipient_public_key: recipientPublicKey,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "privy-app-id": appId,
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
    };

    const authPrivKey = process.env.PRIVY_WALLET_AUTH_PRIVATE_KEY;
    if (authPrivKey) {
      const sig = generateAuthorizationSignature({
        input: {
          version: 1,
          method: "POST",
          url,
          body: exportBody,
          headers: { "privy-app-id": appId },
        },
        authorizationPrivateKey: authPrivKey,
      });
      if (sig) {
        headers["privy-authorization-signature"] = sig;
      }
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(exportBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[starknet/export-wallet] Privy error", res.status, errText);
      return NextResponse.json(
        { error: "Export failed", detail: errText.slice(0, 500) },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 },
      );
    }

    const data = (await res.json()) as {
      encryption_type: string;
      ciphertext: string;
      encapsulated_key: string;
    };

    const responseTime = Date.now() - startTime;
    trackApiResponse("/api/starknet/export-wallet", "POST", 200, responseTime, {
      privy_user_id: authUserId,
    });

    return NextResponse.json({
      encryption_type: data.encryption_type,
      ciphertext: data.ciphertext,
      encapsulated_key: data.encapsulated_key,
    });
  } catch (error: unknown) {
    console.error("[starknet/export-wallet]", error);
    const responseTime = Date.now() - startTime;
    const err =
      error instanceof Error ? error : new Error("Failed to export wallet");
    trackApiError(request, "/api/starknet/export-wallet", "POST", err, 500, {
      response_time_ms: responseTime,
    });
    return NextResponse.json(
      { error: err.message || "Failed to export wallet" },
      { status: 500 },
    );
  }
});
