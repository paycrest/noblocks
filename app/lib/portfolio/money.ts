import DecimalBase from "decimal.js";

const Decimal = DecimalBase.clone({ precision: 40 });

const ZERO = new Decimal(0);

export function formatBaseUnitsToDecimal(
  baseUnits: bigint,
  decimals: number,
): string {
  const safeDecimals = Math.max(0, Math.min(Math.trunc(decimals), 36));
  if (baseUnits === BigInt(0)) {
    return ZERO.toFixed(safeDecimals);
  }
  const scale = new Decimal(10).pow(safeDecimals);
  return new Decimal(baseUnits.toString()).div(scale).toFixed(safeDecimals);
}

export function isZeroDecimalString(amount: string): boolean {
  try {
    return new Decimal(amount.trim()).isZero();
  } catch {
    return true;
  }
}

export function multiplyAmountByPrice(
  amount: string,
  usdPerUnit: string,
): string {
  return new Decimal(amount).mul(usdPerUnit).toFixed();
}

export function sumUsdStrings(values: string[]): string {
  return values.reduce(
    (acc, v) => acc.plus(v),
    ZERO,
  ).toFixed();
}

export function maxDecimal(a: string, b: string): string {
  const da = new Decimal(a);
  const db = new Decimal(b);
  return da.gte(db) ? da.toFixed() : db.toFixed();
}

/** @internal tests — module uses a cloned Decimal, not global precision. */
export function portfolioMoneyDecimalPrecision(): number {
  return Decimal.precision;
}
