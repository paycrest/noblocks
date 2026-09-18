import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { rateLimit } from "@/app/lib/rate-limit";
import { supabaseAdmin } from "@/app/lib/supabase";
import { SUPPORTED_CHAINS } from "@/app/lib/bundler/chains";
import { getRpcUrl } from "@/app/utils";
import { getAppUrl } from "@/app/lib/server-config";
import {
  isSiweDomainAllowed,
  isSiweIssuedAtFresh,
  signInjectedSessionJwt,
} from "@/app/lib/injectedSessionAuth";

/**
 * POST /api/auth/injected/verify — SIWE sign-in for injected wallets.
 *
 * Exchanges a signed EIP-4361 message for a short-lived session JWT that the
 * middleware accepts as `x-injected-token`. This is the ONLY way an injected
 * wallet becomes an authenticated API identity; the middleware never trusts a
 * raw client-supplied address.
 *
 * Deliberately outside the middleware matcher (it is the login endpoint).
 * Stateless anti-replay: client-generated nonce + a 5-minute issuedAt window.
 * Upgrading to single-use server nonces later only requires a nonce endpoint —
 * the message/verify shape stays the same.
 */

// Keep in sync with EMBED_ORIGIN_RE in middleware.ts and ORIGIN_RE in
// app/api/internal/embed-origins/route.ts.
const ORIGIN_RE =
  /^https:\/\/(\*\.)?[\w.-]+(:\d+)?$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Origins whose SIWE `domain` may mint a session: the canonical app origin
 * (configured, NEVER derived from the request Host header — a phisher could
 * otherwise have a victim sign for evil.com and replay it here with a spoofed
 * Host) plus the embed allowlist — the same trust set allowed to iframe
 * /widget, since in bridge mode the host page's wallet signs and honest
 * wallets display the host page's domain.
 */
async function getAllowedSiweOrigins(): Promise<string[]> {
  const origins: string[] = [];

  const appUrl = getAppUrl();
  if (appUrl && ORIGIN_RE.test(appUrl)) {
    origins.push(appUrl);
  }

  for (const origin of (process.env.EMBED_ALLOWED_ORIGINS ?? "").split(
    /[,\s]+/,
  )) {
    const trimmed = origin.trim();
    if (trimmed && ORIGIN_RE.test(trimmed)) origins.push(trimmed);
  }

  // `supabaseAdmin` is a lazy Proxy that THROWS on property access when
  // SUPABASE_* env is missing, so `.from()` can throw before any query runs —
  // outside the `error` result. Both failure shapes must be caught here, or a
  // Supabase misconfiguration takes down sign-in entirely instead of degrading
  // to the env-configured origins below.
  try {
    const { data, error } = await supabaseAdmin
      .from("embed_allowed_origins")
      .select("origin");
    if (error) {
      // Fail closed for DB-backed partners; env-configured origins still work.
      console.error("[injected-auth] failed to load embed origins:", error.message);
    } else {
      for (const row of data ?? []) {
        if (row.origin && ORIGIN_RE.test(row.origin)) origins.push(row.origin);
      }
    }
  } catch (dbError) {
    console.error(
      "[injected-auth] embed origins unavailable:",
      dbError instanceof Error ? dbError.message : dbError,
    );
  }

  return origins;
}

export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const message = body?.message;
    const signature = body?.signature;
    if (
      typeof message !== "string" ||
      typeof signature !== "string" ||
      message.length > 2_000 ||
      signature.length > 50_000 ||
      !signature.startsWith("0x")
    ) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const parsed = parseSiweMessage(message);
    const { address, domain, chainId, issuedAt, nonce, uri } = parsed;
    if (!address || !domain || !chainId || !issuedAt || !uri || !nonce || nonce.length < 8) {
      return NextResponse.json(
        { error: "Malformed sign-in message" },
        { status: 400 },
      );
    }

    if (!isSiweIssuedAtFresh(issuedAt, Date.now())) {
      return NextResponse.json(
        { error: "Sign-in message expired. Please try again." },
        { status: 401 },
      );
    }

    const allowedOrigins = await getAllowedSiweOrigins();
    if (!isSiweDomainAllowed(domain, allowedOrigins)) {
      return NextResponse.json(
        { error: "Sign-in domain is not allowed" },
        { status: 401 },
      );
    }

    const chainEntry = SUPPORTED_CHAINS[chainId];
    if (!chainEntry) {
      return NextResponse.json(
        { error: "Unsupported chain for sign-in" },
        { status: 400 },
      );
    }
    const rpcUrl = getRpcUrl(chainEntry.networkName);
    if (!rpcUrl) {
      return NextResponse.json(
        { error: "Sign-in unavailable for this network" },
        { status: 500 },
      );
    }

    // ERC-6492 universal verification: covers EOAs and deployed/undeployed
    // smart wallets (EIP-1271) in one call. One RPC round-trip per sign-in.
    const publicClient = createPublicClient({
      chain: chainEntry.chain,
      transport: http(rpcUrl),
    });
    const valid = await publicClient.verifySiweMessage({
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid wallet signature" },
        { status: 401 },
      );
    }

    const { token, expiresAt } = await signInjectedSessionJwt(address);
    return NextResponse.json({ token, expiresAt });
  } catch (error) {
    // Missing INJECTED_SESSION_SECRET lands here — log the real cause, return generic.
    console.error("[injected-auth] verify failed:", error);
    return NextResponse.json(
      { error: "Sign-in verification failed" },
      { status: 500 },
    );
  }
}
