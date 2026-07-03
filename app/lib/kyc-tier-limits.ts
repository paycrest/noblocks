/**
 * KYC tier monthly spend limits (USD). Used by the client (NEXT_PUBLIC_*) and API route.
 * Tier 0 = unverified (no monthly spend until phone). Tier 1 = phone, 2 = ID, 3 = address.
 *
 * Tier 3 additionally accepts the sentinel string "unlimited" (case-insensitive) in
 * NEXT_PUBLIC_KYC_TIER_3_MONTHLY to remove the monthly cap entirely. Tiers 0–2 remain
 * numeric-only. Do NOT use 0 for unlimited — tier 0 uses 0 to mean "no swaps until phone".
 */
const DEFAULT_KYC_MONTHLY_LIMITS: Record<number, number> = {
  0: 0,
  1: 0.5,
  2: 1,
  3: 2,
};

/** Resolved limit for a tier. When `unlimited` is true, `monthly` is 0 and must be ignored. */
export interface KycTierLimit {
  monthly: number;
  unlimited: boolean;
}

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

/** True when a tier-3 env value is the "unlimited" sentinel (trimmed, case-insensitive). */
export function isUnlimitedTier3EnvValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "unlimited";
}

/**
 * Tier-3-specific parser. Accepts the "unlimited" sentinel or a non-negative number.
 * Invalid/empty values fall back to the default tier-3 cap.
 */
export function parseTier3MonthlyLimit(raw: string | undefined): KycTierLimit {
  if (isUnlimitedTier3EnvValue(raw)) {
    return { monthly: 0, unlimited: true };
  }
  return {
    monthly: parseNonNegativeNumber(raw, DEFAULT_KYC_MONTHLY_LIMITS[3]),
    unlimited: false,
  };
}

/**
 * Per-tier limit config. Tiers 0–2 are numeric-only; tier 3 may be unlimited.
 * Prefer this over getKycMonthlyLimitsRecord() — callers must honor `unlimited`.
 */
export function getKycTierLimit(tier: number): KycTierLimit {
  switch (tier) {
    case 0:
      return {
        monthly: parseNonNegativeNumber(
          process.env.NEXT_PUBLIC_KYC_TIER_0_MONTHLY,
          DEFAULT_KYC_MONTHLY_LIMITS[0],
        ),
        unlimited: false,
      };
    case 1:
      return {
        monthly: parseNonNegativeNumber(
          process.env.NEXT_PUBLIC_KYC_TIER_1_MONTHLY,
          DEFAULT_KYC_MONTHLY_LIMITS[1],
        ),
        unlimited: false,
      };
    case 2:
      return {
        monthly: parseNonNegativeNumber(
          process.env.NEXT_PUBLIC_KYC_TIER_2_MONTHLY,
          DEFAULT_KYC_MONTHLY_LIMITS[2],
        ),
        unlimited: false,
      };
    case 3:
      return parseTier3MonthlyLimit(process.env.NEXT_PUBLIC_KYC_TIER_3_MONTHLY);
    default:
      return { monthly: 0, unlimited: false };
  }
}

/**
 * Monthly USD limits per tier (0–3), numeric only. Env: NEXT_PUBLIC_KYC_TIER_{n}_MONTHLY.
 *
 * Backward-compat shim for legacy callers that only need a number. An unlimited tier 3
 * collapses to `monthly: 0` here, which is indistinguishable from "no limit configured" —
 * consumers that must respect unlimited should call getKycTierLimit() and check `.unlimited`.
 */
export function getKycMonthlyLimitsRecord(): Record<number, number> {
  return {
    0: getKycTierLimit(0).monthly,
    1: getKycTierLimit(1).monthly,
    2: getKycTierLimit(2).monthly,
    3: getKycTierLimit(3).monthly,
  };
}
