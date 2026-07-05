import type { FantasySettings } from "./types";

/**
 * Pure referral-activation math (PRD F-6). Isomorphic so the worker sweep and
 * tests share one implementation of the stakeholder-decided rule: activation
 * is CUMULATIVE — a referred user activates when their TOTAL completed
 * on/off-ramp USD-equivalent volume inside the campaign window reaches the
 * threshold, NOT when a single transaction does.
 */

export interface ReferralTx {
  transaction_type: string; // 'onramp' | 'offramp' (transfers excluded upstream)
  from_currency: string;
  to_currency: string;
  amount_sent: number;
  amount_received: number;
  created_at: string;
}

/** USD-equivalent of the crypto leg (stables at par, CNGN at the settings rate). */
export function txUsdValue(
  tx: Pick<
    ReferralTx,
    "transaction_type" | "from_currency" | "to_currency" | "amount_sent" | "amount_received"
  >,
  cngnRate: number,
): number {
  const [currency, amount] =
    tx.transaction_type === "onramp"
      ? [tx.to_currency, Number(tx.amount_received)]
      : [tx.from_currency, Number(tx.amount_sent)];
  const code = (currency || "").toUpperCase();
  if (code === "USDC" || code === "USDT" || code === "CUSD") return amount;
  if (code === "CNGN") return amount * cngnRate;
  return 0;
}

/**
 * Fold a referred wallet's in-window transactions into cumulative progress.
 * activated_at = created_at of the transaction that crosses the threshold
 * (transactions are processed in chronological order).
 */
export function cumulativeActivation(
  txs: ReferralTx[],
  settings: Pick<FantasySettings, "referral_min_total_usd" | "cngn_usd_rate">,
): { total: number; activatedAt: string | null } {
  const sorted = [...txs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  let total = 0;
  let activatedAt: string | null = null;
  for (const tx of sorted) {
    total += txUsdValue(tx, settings.cngn_usd_rate);
    if (activatedAt === null && total >= settings.referral_min_total_usd) {
      activatedAt = tx.created_at;
    }
  }
  return { total: Math.round(total * 100) / 100, activatedAt };
}
