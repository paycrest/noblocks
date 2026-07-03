import { parseUnits } from "viem";

/**
 * Pure decision logic for onramp "chained forwarding" leg 2 (Noblocks wallet -> external wallet).
 *
 * Leg 2 is client-signed (EIP-7702), so it can only run while a browser tab is open. To make it
 * idempotent and resumable, the wiring persists a durable record (localStorage) and reads the
 * wallet's fresh on-chain token balance. This module decides — given that record, the intended
 * amount, the live balance, and timing — whether to forward, treat it as already done, wait for an
 * in-flight transfer, or skip. ALL money math is bigint; the float `balances` map is never used here.
 *
 * The on-chain balance is the hard safety bound: we never forward more than the wallet holds, and a
 * drained balance means the funds already left (so we must not re-forward).
 */

export type ForwardStatus =
  | "pending"
  | "forwarding"
  | "completed"
  | "skipped"
  | "failed";

export interface ForwardRecord {
  orderId: string;
  /** External destination chosen by the user. Source of truth on reload (form state is lost). */
  destination: string;
  /** Crypto token symbol being forwarded (e.g. "USDC"). */
  token: string;
  /** Intended crypto amount in wei, as a string for JSON/localStorage round-tripping. */
  amountWei: string;
  status: ForwardStatus;
  /** Leg-2 onchain tx hash, once known. */
  txHash?: string;
  /** Epoch ms of the last write — drives the staleness window. */
  updatedAt: number;
}

export type ForwardDecision =
  | { action: "skip"; reason: string }
  | { action: "complete"; reason: string; txHash?: string }
  | { action: "forward"; reason: string; amountWei: bigint }
  | { action: "wait"; reason: string };

export interface DecideForwardInput {
  record: ForwardRecord | null;
  /** Intended crypto amount in wei (from the form's received amount, persisted). 0n if unknown. */
  orderAmountWei: bigint;
  /** Fresh on-chain token balance of the Noblocks wallet, in wei. */
  balanceWei: bigint;
  /** Destination address: record wins, falling back to form. */
  destination: string;
  /** The user's Noblocks (embedded) wallet address. */
  noblocksWallet: string;
  /** Current time, epoch ms (injected for testability). */
  now: number;
  /** How long a `pending`/`forwarding` record is treated as an in-flight transfer to wait on. */
  stalenessMs: number;
  /** Below-this balance is treated as "drained" / not worth forwarding. */
  dustWei: bigint;
}

/** Default: wait up to 2 min for an in-flight (signed/submitted) transfer before resubmitting. */
export const DEFAULT_STALENESS_MS = 120_000;

/** Dust ≈ 0.01 of a token (10^(decimals-2)); tokens with <2 decimals have no dust floor. */
export function dustWeiForDecimals(decimals: number): bigint {
  if (!Number.isFinite(decimals) || decimals <= 2) return BigInt(0);
  return BigInt(10) ** BigInt(decimals - 2);
}

/** Convert a display amount (e.g. 20.4) to wei, tolerant of junk input (returns 0n). */
export function toAmountWei(
  amount: string | number,
  decimals: number,
): bigint {
  const amtStr = (typeof amount === "number" ? amount.toString() : amount).trim();
  if (!amtStr || !Number.isFinite(Number(amtStr)) || Number(amtStr) <= 0) {
    return BigInt(0);
  }
  try {
    return parseUnits(amtStr as `${number}`, decimals);
  } catch {
    return BigInt(0);
  }
}

function sameAddress(a: string, b: string): boolean {
  return (
    !!a &&
    !!b &&
    a.trim().toLowerCase() === b.trim().toLowerCase()
  );
}

/**
 * Decide what to do with leg-2 forwarding. Evaluation order: hard guards first (destination,
 * terminal record states), then the balance/timing matrix. See the case table in the PR/plan.
 */
export function decideForwardAction(input: DecideForwardInput): ForwardDecision {
  const {
    record,
    orderAmountWei,
    balanceWei,
    destination,
    noblocksWallet,
    now,
    stalenessMs,
    dustWei,
  } = input;

  const status = record?.status ?? null;

  // G1: no usable destination → nothing we can safely send to.
  if (!destination || !noblocksWallet) {
    return { action: "skip", reason: "no-destination" };
  }
  // G2: destination is the Noblocks wallet itself → funds already at destination.
  if (sameAddress(destination, noblocksWallet)) {
    return { action: "skip", reason: "self-destination" };
  }
  // G3/G4: terminal record states are final.
  if (status === "completed") return { action: "skip", reason: "already-completed" };
  if (status === "skipped") return { action: "skip", reason: "already-skipped" };

  const drained = balanceWei <= dustWei;

  // G5: funds have left the wallet.
  if (drained) {
    if (status === "pending" || status === "forwarding" || status === "failed") {
      // We claimed/attempted and the balance is gone → the transfer landed; finalize, don't resend.
      return { action: "complete", reason: "balance-drained", txHash: record?.txHash };
    }
    // No record and nothing to send.
    return { action: "skip", reason: "no-balance-no-record" };
  }

  // Balance is present. Fail closed if we don't know the intended amount: forwarding the whole
  // balance could sweep the user's pre-existing funds (e.g. after storage loss or a parse failure).
  if (orderAmountWei <= BigInt(0)) {
    return { action: "skip", reason: "unknown-order-amount" };
  }

  // Cap the intended amount by what's actually in the wallet (handles partial settlement).
  const targetWei = orderAmountWei < balanceWei ? orderAmountWei : balanceWei;

  // G6: nothing meaningful to forward.
  if (targetWei <= dustWei) {
    return { action: "skip", reason: "amount-below-dust" };
  }

  const recent = record ? now - record.updatedAt < stalenessMs : false;

  switch (status) {
    case null:
      return { action: "forward", reason: "initial", amountWei: targetWei };
    case "failed":
      return { action: "forward", reason: "retry-after-failure", amountWei: targetWei };
    case "pending":
    case "forwarding":
      // Funds still present + a recent claim → another session is mid-transfer; wait, don't double-send.
      if (recent) return { action: "wait", reason: `${status}-recent` };
      // Stale claim with funds still here → the earlier attempt didn't land; take over.
      return { action: "forward", reason: `${status}-stale-resubmit`, amountWei: targetWei };
    default:
      return { action: "skip", reason: "unknown-status" };
  }
}
