import { address, createSolanaRpc } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import config from "./config";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** Mainnet USDC mint — matches `FALLBACK_TOKENS["Solana"]` until aggregator `/tokens` is authoritative. */
export const DEFAULT_SOLANA_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function solanaRpcUrl(): string {
  return (
    config.solanaRpc?.trim() || "https://api.mainnet-beta.solana.com"
  );
}

/** Derive the USDC associated token account for `owner` (base58 pubkeys). */
export async function deriveAssociatedTokenAddress(
  owner: string,
  mint: string = DEFAULT_SOLANA_USDC_MINT,
): Promise<string> {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner.trim()),
    tokenProgram: address(TOKEN_PROGRAM),
    mint: address(mint.trim()),
  });
  return ata;
}

/** True when the token account exists on-chain (ATA initialized). */
export async function tokenAccountExists(ata: string): Promise<boolean> {
  const rpc = createSolanaRpc(solanaRpcUrl());
  const info = await rpc.getAccountInfo(address(ata.trim()), { encoding: "base64" }).send();
  return info.value != null;
}

/** SPL balance in base units; null when the ATA does not exist. */
export async function fetchTokenAccountBalanceBaseUnits(
  ata: string,
): Promise<bigint | null> {
  const rpc = createSolanaRpc(solanaRpcUrl());
  try {
    const result = await rpc
      .getTokenAccountBalance(address(ata.trim()))
      .send();
    return BigInt(result.value.amount);
  } catch {
    return null;
  }
}
