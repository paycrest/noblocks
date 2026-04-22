/**
 * KYC tier monthly spend limits (USD). Used by the client (NEXT_PUBLIC_*) and API route.
 * Tier 0 = no swaps until verified.
 */
const DEFAULT_KYC_MONTHLY_LIMITS: Record<number, number> = {
  0: 0,
  1: 100,
  2: 15000,
  3: 50000,
};

function parseNonNegativeNumber(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }
  return n;
}

/** Monthly USD limits per tier (0–3). Env: NEXT_PUBLIC_KYC_TIER_{n}_MONTHLY */
export function getKycMonthlyLimitsRecord(): Record<number, number> {
  return {
    0: parseNonNegativeNumber(
      "NEXT_PUBLIC_KYC_TIER_0_MONTHLY",
      DEFAULT_KYC_MONTHLY_LIMITS[0],
    ),
    1: parseNonNegativeNumber(
      "NEXT_PUBLIC_KYC_TIER_1_MONTHLY",
      DEFAULT_KYC_MONTHLY_LIMITS[1],
    ),
    2: parseNonNegativeNumber(
      "NEXT_PUBLIC_KYC_TIER_2_MONTHLY",
      DEFAULT_KYC_MONTHLY_LIMITS[2],
    ),
    3: parseNonNegativeNumber(
      "NEXT_PUBLIC_KYC_TIER_3_MONTHLY",
      DEFAULT_KYC_MONTHLY_LIMITS[3],
    ),
  };
}
