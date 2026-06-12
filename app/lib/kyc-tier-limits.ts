/**
 * KYC tier monthly spend limits (USD). Used by the client (NEXT_PUBLIC_*) and API route.
 * Tier 0 = unverified (no monthly spend until phone). Tier 1 = phone, 2 = ID, 3 = address.
 */
const DEFAULT_KYC_MONTHLY_LIMITS: Record<number, number> = {
  0: 0,
  1: 0.5,
  2: 1,
  3: 2,
};

function parseNonNegativeNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }
  return n;
}

/** Monthly USD limits per tier (0–3). Env: NEXT_PUBLIC_KYC_TIER_{n}_MONTHLY */
export function getKycMonthlyLimitsRecord(): Record<number, number> {
  return {
    0: parseNonNegativeNumber(
      process.env.NEXT_PUBLIC_KYC_TIER_0_MONTHLY,
      DEFAULT_KYC_MONTHLY_LIMITS[0],
    ),
    1: parseNonNegativeNumber(
      process.env.NEXT_PUBLIC_KYC_TIER_1_MONTHLY,
      DEFAULT_KYC_MONTHLY_LIMITS[1],
    ),
    2: parseNonNegativeNumber(
      process.env.NEXT_PUBLIC_KYC_TIER_2_MONTHLY,
      DEFAULT_KYC_MONTHLY_LIMITS[2],
    ),
    3: parseNonNegativeNumber(
      process.env.NEXT_PUBLIC_KYC_TIER_3_MONTHLY,
      DEFAULT_KYC_MONTHLY_LIMITS[3],
    ),
  };
}
