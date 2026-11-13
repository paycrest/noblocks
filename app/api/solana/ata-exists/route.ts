import { NextRequest, NextResponse } from "next/server";
import config from "@/app/lib/config";
import {
  DEFAULT_SOLANA_USDC_MINT,
  deriveAssociatedTokenAddress,
  tokenAccountExists,
} from "@/app/lib/solanaAta";
import { isValidSolanaAddress } from "@/app/lib/validation";
import { withRateLimit } from "@/app/lib/rate-limit";
import { isInjectedUserId } from "@/app/lib/injected-identity";
import { collectLinkedWalletAddressesForChainType } from "@/app/lib/privy";
import { ensureTokenAccount, isSolanaSponsorConfigured } from "@/app/lib/solanaSponsor";
import { fetchTokens } from "@/app/api/aggregator";
import { normalizeNetworkName } from "@/app/utils";

export const GET = withRateLimit(async (request: NextRequest) => {
  if (!config.solanaEnabled) {
    return NextResponse.json({ error: "Solana is not enabled" }, { status: 404 });
  }

  const owner = request.nextUrl.searchParams.get("owner")?.trim() ?? "";
  const mint =
    request.nextUrl.searchParams.get("mint")?.trim() ??
    DEFAULT_SOLANA_USDC_MINT;

  if (!isValidSolanaAddress(owner)) {
    return NextResponse.json({ error: "Invalid owner address" }, { status: 400 });
  }
  if (!isValidSolanaAddress(mint)) {
    return NextResponse.json({ error: "Invalid mint address" }, { status: 400 });
  }

  try {
    const ata = await deriveAssociatedTokenAddress(owner, mint);
    const exists = await tokenAccountExists(ata);
    return NextResponse.json({ owner, mint, ata, exists });
  } catch (error) {
    console.error("solana ata-exists:", error);
    return NextResponse.json(
      { error: "Failed to check associated token account" },
      { status: 500 },
    );
  }
});

/**
 * Before a Solana buy: makes sure the recipient can receive the token. The aggregator holds a
 * delivery to an address with no token account, and a new embedded wallet has none. For the
 * caller's own Solana wallet Noblocks opens it (sponsor pays the rent); for any other address
 * the buy is refused with an explanation instead of stalling after payment.
 */
export const POST = withRateLimit(async (request: NextRequest) => {
  if (!config.solanaEnabled) {
    return NextResponse.json({ error: "Solana is not enabled" }, { status: 404 });
  }
  const userId = request.headers.get("x-user-id");
  if (!request.headers.get("x-wallet-address") || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { owner?: unknown; token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const owner = typeof body.owner === "string" ? body.owner.trim() : "";
  const symbol = typeof body.token === "string" ? body.token.trim().toUpperCase() : "";
  if (!isValidSolanaAddress(owner)) {
    return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });
  }

  try {
    const token = (await fetchTokens()).find(
      (t) => t.symbol.toUpperCase() === symbol && normalizeNetworkName(t.network) === "Solana",
    );
    if (!token || !isValidSolanaAddress(token.contractAddress)) {
      return NextResponse.json(
        { error: `${symbol || "This token"} is not available on Solana right now` },
        { status: 400 },
      );
    }
    const mint = token.contractAddress;
    if (await tokenAccountExists(await deriveAssociatedTokenAddress(owner, mint))) {
      return NextResponse.json({ owner, mint, exists: true });
    }

    const ownsAddress =
      !isInjectedUserId(userId) &&
      (await collectLinkedWalletAddressesForChainType(userId, "solana")).includes(owner);
    if (!ownsAddress) {
      return NextResponse.json(
        {
          error: `This address can't receive ${token.symbol} on Solana yet: it has no ${token.symbol} token account. Send any amount of ${token.symbol} to it once, or buy to your Noblocks wallet.`,
        },
        { status: 422 },
      );
    }
    if (!isSolanaSponsorConfigured()) {
      console.error("solana ata-exists: SPONSOR_SOLANA_WALLET_PRIVATE_KEY is not configured");
      return NextResponse.json(
        { error: "Solana is temporarily unavailable" },
        { status: 503 },
      );
    }
    const result = await ensureTokenAccount(owner, mint);
    return NextResponse.json({ owner, mint, exists: true, created: result === "created" });
  } catch (error) {
    console.error("solana ata-exists (ensure):", error);
    return NextResponse.json(
      { error: "Could not prepare your Solana wallet. Please try again." },
      { status: 503 },
    );
  }
});
