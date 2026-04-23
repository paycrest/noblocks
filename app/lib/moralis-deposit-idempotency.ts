import { createHash } from "crypto";
import { supabaseAdmin } from "@/app/lib/supabase";

export type MoralisDepositIdempotencyInput =
  | { kind: "native"; chainId: string; txHash: string; to: string }
  | {
      kind: "erc20";
      chainId: string;
      txHash: string;
      to: string;
      from: string;
      valueWithDecimals: string;
      tokenSymbol: string;
    };

function isPostgresUniqueViolation(e: { code?: string; message?: string }): boolean {
  if (e.code === "23505") {
    return true;
  }
  return /unique|duplicate key/i.test(e.message || "");
}

/** Normalizes Moralis `chainId` so `0x1` and `0x01` map to the same idempotency key. */
function normalizeChainIdForIdempotency(chainId: string): string {
  const s = chainId.trim();
  if (!s) {
    return s;
  }
  try {
    if (/^0x/i.test(s)) {
      return `0x${BigInt(s).toString(16)}`;
    }
    if (/^\d+$/.test(s)) {
      return `0x${BigInt(s).toString(16)}`;
    }
    return `0x${BigInt(`0x${s}`).toString(16)}`;
  } catch {
    return s.toLowerCase();
  }
}

function buildMoralisDepositIdempotencyKey(
  input: MoralisDepositIdempotencyInput,
): string {
  const c = normalizeChainIdForIdempotency(input.chainId);
  const h = input.txHash.toLowerCase().trim();
  if (input.kind === "native") {
    const s = `v1|${c}|${h}|native|${input.to.toLowerCase().trim()}`;
    return createHash("sha256").update(s).digest("hex");
  }
  const s = `v1|${c}|${h}|erc20|${input.to.toLowerCase().trim()}|${input.from.toLowerCase().trim()}|${input.valueWithDecimals}|${input.tokenSymbol.toLowerCase().trim()}`;
  return createHash("sha256").update(s).digest("hex");
}

async function tryClaimMoralisDepositIdempotencyKey(
  idempotencyKey: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("moralis_deposit_idempotency").insert({
    idempotency_key: idempotencyKey,
  });
  if (error) {
    if (isPostgresUniqueViolation(error)) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          "[moralis idempotency] duplicate, skipping",
          idempotencyKey.slice(0, 16) + "…",
        );
      }
      return false;
    }
    console.error("[moralis idempotency] claim insert failed", error);
    return true;
  }
  return true;
}

async function releaseMoralisDepositIdempotencyKey(
  idempotencyKey: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("moralis_deposit_idempotency")
    .delete()
    .eq("idempotency_key", idempotencyKey);
  if (error) {
    console.error(
      "[moralis idempotency] release delete failed",
      idempotencyKey.slice(0, 16) + "…",
      error,
    );
  }
}

/**
 * Deduplicate Moralis webhook redeliveries: claim key → run work → on failure, release
 * so a retry can succeed. Returns `"duplicate"` if this transfer was already processed.
 */
export async function moralisDepositNotificationOnce(
  input: MoralisDepositIdempotencyInput,
  work: () => Promise<void>,
): Promise<"ok" | "duplicate"> {
  const key = buildMoralisDepositIdempotencyKey(input);
  const claimed = await tryClaimMoralisDepositIdempotencyKey(key);
  if (!claimed) {
    return "duplicate";
  }
  try {
    await work();
  } catch (e) {
    await releaseMoralisDepositIdempotencyKey(key);
    throw e;
  }
  return "ok";
}
