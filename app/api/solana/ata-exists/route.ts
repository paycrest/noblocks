import { NextRequest, NextResponse } from "next/server";
import config from "@/app/lib/config";
import {
  DEFAULT_SOLANA_DEVNET_USDC_MINT,
  deriveAssociatedTokenAddress,
  tokenAccountExists,
} from "@/app/lib/solanaAta";
import { isValidSolanaAddress } from "@/app/lib/validation";
import { withRateLimit } from "@/app/lib/rate-limit";

export const GET = withRateLimit(async (request: NextRequest) => {
  if (!config.solanaEnabled) {
    return NextResponse.json({ error: "Solana is not enabled" }, { status: 404 });
  }

  const owner = request.nextUrl.searchParams.get("owner")?.trim() ?? "";
  const mint =
    request.nextUrl.searchParams.get("mint")?.trim() ??
    DEFAULT_SOLANA_DEVNET_USDC_MINT;

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
