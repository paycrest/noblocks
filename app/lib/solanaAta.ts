import { address, createSolanaRpc } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import config from "./config";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** Devnet USDC mint — matches `FALLBACK_TOKENS["Solana Devnet"]` until aggregator `/tokens` is authoritative. */
export const DEFAULT_SOLANA_DEVNET_USDC_MINT =
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export function solanaDevnetRpcUrl(): string {
  return (
    config.solanaDevnetRpc?.trim() || "https://api.devnet.solana.com"
  );
}

/** Derive the USDC associated token account for `owner` (base58 pubkeys). */
export async function deriveAssociatedTokenAddress(
  owner: string,
  mint: string = DEFAULT_SOLANA_DEVNET_USDC_MINT,
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
  const rpc = createSolanaRpc(solanaDevnetRpcUrl());
  const info = await rpc.getAccountInfo(address(ata.trim()), { encoding: "base64" }).send();
  return info.value != null;
}

/** SPL balance in base units; null when the ATA does not exist. */
export async function fetchTokenAccountBalanceBaseUnits(
  ata: string,
): Promise<bigint | null> {
  const rpc = createSolanaRpc(solanaDevnetRpcUrl());
  try {
    const result = await rpc
      .getTokenAccountBalance(address(ata.trim()))
      .send();
    return BigInt(result.value.amount);
  } catch {
    return null;
  }
}
