import type { KYCTierLevel } from "@/app/context/KYCContext";

/**
 * Verification ladder (monthly caps from `NEXT_PUBLIC_KYC_TIER_*_MONTHLY`):
 * - Tier 0: free mode — transact within cap, no phone/ID/address required
 * - Tier 1: phone verification
 * - Tier 2: government ID + selfie
 * - Tier 3: address verification
 */
export type KycUpgradeStep = "phone" | "id" | "address";

/** Next step to unlock the tier above the user's current one. */
export function getKycUpgradeStep(currentTier: KYCTierLevel): KycUpgradeStep {
  if (currentTier < 1) return "phone";
  if (currentTier === 1) return "id";
  return "address";
}

/** Smile ID / address flows in `KycModal` (tier 1 uses phone modal only). */
export function getKycModalTargetTier(currentTier: KYCTierLevel): 2 | 3 {
  return currentTier >= 2 ? 3 : 2;
}

export function isFreeModeTier(tier: KYCTierLevel): boolean {
  return tier < 1;
}

/** User has completed at least phone verification (tier 1+). */
export function hasAssignedKycTier(tier: number): tier is KYCTierLevel & (1 | 2 | 3) {
  return tier >= 1;
}

/** Profile / limit UI (Figma): "Tier 1", not "Free" or verification step names. */
export function formatKycTierDisplayLabel(level: number): string {
  return `Tier ${level}`;
}
