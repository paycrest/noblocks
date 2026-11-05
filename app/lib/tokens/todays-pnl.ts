import Decimal from "decimal.js";

const money = Decimal.clone({ precision: 40 });

/**
 * Market snapshot `change24h.abs` is the per-unit USD delta (current − past) from
 * `absChangeDecimal` in market-data/validate.ts — signed, not a magnitude.
 * If delta and `pct` disagree in sign, treat `abs` as magnitude and apply `pct` sign.
 */
function resolveSignedUnitPriceChange(change24h: Change24h): InstanceType<typeof money> {
  const unitDelta = money(change24h.abs.trim());
  const pct = money(change24h.pct.trim());

  if (unitDelta.isZero() || pct.isZero()) {
    return unitDelta;
  }

  const deltaNegative = unitDelta.isNegative();
  const pctNegative = pct.isNegative();

  if (deltaNegative === pctNegative) {
    return unitDelta;
  }

  return unitDelta.abs().mul(pctNegative ? -1 : 1);
}

export type Change24h = { pct: string; abs: string };

export type TodaysPnlResult =
  | {
      status: "ok";
      /** USD PnL for the holding (signed decimal string). */
      usd: string;
      pct: string;
    }
  | { status: "unavailable" };

/**
 * Epic Q6 working assumption (KAN-970): Today's PnL (USD) =
 * token balance × signed 24h unit price change, using Decimal.js (never floats).
 */
export function computeTodaysPnlUsd(
  balanceAmount: string,
  change24h: Change24h | null | undefined,
): TodaysPnlResult {
  if (!change24h) {
    return { status: "unavailable" };
  }
  try {
    const amount = money(balanceAmount.trim());
    const pct = change24h.pct.trim();
    if (!pct) {
      return { status: "unavailable" };
    }
    const signedUnit = resolveSignedUnitPriceChange(change24h);
    const usd = amount.mul(signedUnit);
    return { status: "ok", usd: usd.toFixed(), pct };
  } catch {
    return { status: "unavailable" };
  }
}

export function formatSignedUsdPnl(usd: string): string {
  try {
    const value = money(usd.trim());
    const rounded = value.abs().toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(rounded.toNumber());
    if (value.isNegative()) {
      return `-${formatted}`;
    }
    if (value.isPositive()) {
      return `+${formatted}`;
    }
    return formatted;
  } catch {
    return "—";
  }
}

export function formatChangePctDisplay(pct: string): string {
  try {
    const value = money(pct.trim());
    const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const num = rounded.toNumber();
    if (num > 0) return `+${num.toFixed(2)}%`;
    if (num < 0) return `${num.toFixed(2)}%`;
    return "0.00%";
  } catch {
    return "—";
  }
}

export function changePctTone(pct: string): "up" | "down" | "flat" {
  try {
    const value = money(pct.trim());
    if (value.isPositive()) return "up";
    if (value.isNegative()) return "down";
    return "flat";
  } catch {
    return "flat";
  }
}
