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

const SOLANA_RPC_TIMEOUT_MS = 8_000;

/** SPL token account size; its `state` byte (0 = uninitialized) sits at offset 108. */
const TOKEN_ACCOUNT_LENGTH = 165;
const TOKEN_ACCOUNT_STATE_OFFSET = 108;

/**
 * True for an initialized SPL token account. Presence alone is not enough: SOL sent to an
 * unopened ATA address leaves a system-owned account there that cannot hold tokens.
 */
export function isInitializedTokenAccount(
  info: { owner: string; data: Uint8Array } | null | undefined,
): boolean {
  return (
    info != null &&
    info.owner === TOKEN_PROGRAM &&
    info.data.length === TOKEN_ACCOUNT_LENGTH &&
    info.data[TOKEN_ACCOUNT_STATE_OFFSET] !== 0
  );
}

/** True when the token account is open and can receive tokens. */
export async function tokenAccountExists(ata: string): Promise<boolean> {
  const rpc = createSolanaRpc(solanaRpcUrl());
  const info = await rpc
    .getAccountInfo(address(ata.trim()), { encoding: "base64" })
    .send({ abortSignal: AbortSignal.timeout(SOLANA_RPC_TIMEOUT_MS) });
  if (!info.value) return false;
  return isInitializedTokenAccount({
    owner: info.value.owner,
    data: Buffer.from(info.value.data[0], "base64"),
  });
}

/** SPL balance in base units; null when the ATA does not exist. */
export async function fetchTokenAccountBalanceBaseUnits(
  ata: string,
): Promise<bigint | null> {
  const rpc = createSolanaRpc(solanaRpcUrl());
  try {
    const result = await rpc
      .getTokenAccountBalance(address(ata.trim()))
      .send({ abortSignal: AbortSignal.timeout(SOLANA_RPC_TIMEOUT_MS) });
    return BigInt(result.value.amount);
  } catch {
    return null;
  }
}
