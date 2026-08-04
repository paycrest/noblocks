import { supabaseAdmin } from "@/app/lib/supabase";
import { MAX_KYC_TIER } from "@/app/lib/kyc-tier-limits";

/**
 * Identity-scoped KYC limits.
 *
 * A monthly spend limit belongs to the verified *identity* (phone number and/or ID
 * document), not to a single wallet. One person may legitimately hold several
 * wallets — a Privy embedded wallet plus extension wallets connected through
 * injected/bridge mode — and each must not get its own fresh allowance.
 *
 * Every wallet sharing an identity draws from one pool and is capped at the highest
 * tier any of them reached, so the group's total monthly spend equals the cap of the
 * identity's best tier no matter how many wallets it spans. This is what makes it
 * safe to exempt injected wallets from the phone/ID uniqueness constraints (see
 * `app/lib/injected-identity.ts`) — uniqueness is no longer what bounds spend.
 */

export interface IdentityScope {
  /** Caller + siblings, lowercased and deduped. Always contains the caller. */
  wallets: string[];
  /** MAX(tier) across the group — the identity carries the tier, not the wallet. */
  effectiveTier: number;
  /**
   * Sorted advisory-lock keys for the identity. Sorted so two transactions holding
   * both a phone and an ID key can never take them in opposite orders and deadlock.
   */
  identityKeys: string[];
}

function clampTier(tier: unknown): number {
  const n = Number(tier ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.trunc(n), 0), MAX_KYC_TIER);
}

type SiblingRow = { wallet_address: string | null; tier: number | null };

/**
 * Resolves the spend pool a wallet belongs to.
 *
 * Sibling matching is direct, not transitive: profiles sharing the caller's verified
 * phone number, or its (country, type, number) ID triple. A wallet with neither
 * scopes to itself — tier 0's cap is $0, so there is nothing to farm there.
 *
 * Throws on any Supabase error. Callers must not fall back to a per-wallet scope:
 * silently narrowing the pool would let siblings' spend go uncounted and bypass the
 * limit entirely.
 */
/**
 * Whether any wallet in the identity scope holds an OTP-verified phone number.
 *
 * `phone_number` is deliberately per-wallet (only OTP-confirmed numbers land there), so a wallet
 * that inherited its tier through the ID triple can have `phone_number: null` while a sibling
 * wallet of the same person verified one. The tier-2 phone gate must treat that identity as
 * phone-verified — otherwise it re-prompts forever, and re-verifying the same number is rejected
 * as already in use by the sibling.
 */
export async function identityScopeHasVerifiedPhone(
  wallets: string[],
): Promise<boolean> {
  if (wallets.length === 0) return false;
  const { data, error } = await supabaseAdmin
    .from("user_kyc_profiles")
    .select("wallet_address")
    .in("wallet_address", wallets)
    .not("phone_number", "is", null)
    .gte("tier", 1)
    .limit(1);
  if (error) {
    throw error;
  }
  return (data ?? []).length > 0;
}

/**
 * Fingerprints a single wallet's own verified phone/ID — no sibling lookup.
 *
 * Used to key identity-scoped uniqueness constraints (referral submission and
 * referee-reward claims) on the same two dimensions `resolveIdentityScope`
 * pools on, without paying for the sibling query when only the caller's own
 * values are needed.
 *
 * Unlike `resolveIdentityScope`'s sibling queries (which compare stored values
 * against stored values, so verbatim `.eq()` is self-consistent), these values
 * feed unique indexes — so they are normalized: `phone_number` is already
 * E.164-canonical on write, but the id_* columns store raw client input, and
 * without normalization the same document could yield distinct fingerprints
 * ("NG:passport:A 123" vs "ng:PASSPORT:a123") and both slip past the indexes.
 * Must stay in sync with the backfill in
 * supabase/migrations/20260730120000_identity_scoped_referrals.sql.
 *
 * Throws on any Supabase error — callers must fail closed, same contract as
 * `resolveIdentityScope`.
 */
export async function resolveOwnIdentityFingerprint(
  walletAddress: string,
): Promise<{ phone: string | null; idKey: string | null }> {
  const caller = walletAddress.trim().toLowerCase();

  const { data: profile, error } = await supabaseAdmin
    .from("user_kyc_profiles")
    .select("phone_number, id_country, id_type, id_number")
    .eq("wallet_address", caller)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const phone = profile?.phone_number?.trim() || null;
  const hasId = !!(
    profile?.id_country &&
    profile?.id_type &&
    profile?.id_number
  );

  const normalizePart = (value: string) => value.trim().toUpperCase();

  return {
    phone,
    idKey: hasId
      ? `${normalizePart(profile!.id_country)}:${normalizePart(profile!.id_type)}:${normalizePart(profile!.id_number).replace(/\s/g, "")}`
      : null,
  };
}

export async function resolveIdentityScope(
  walletAddress: string,
): Promise<IdentityScope> {
  const caller = walletAddress.trim().toLowerCase();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("user_kyc_profiles")
    .select("tier, phone_number, id_country, id_type, id_number")
    .eq("wallet_address", caller)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  const ownTier = clampTier(profile?.tier);

  const phone = profile?.phone_number || null;
  const hasId = !!(profile?.id_country && profile?.id_type && profile?.id_number);

  if (!profile || (!phone && !hasId)) {
    return {
      wallets: [caller],
      effectiveTier: ownTier,
      identityKeys: [`wallet:${caller}`],
    };
  }

  const identityKeys: string[] = [];
  const siblingQueries: PromiseLike<{
    data: SiblingRow[] | null;
    error: { message?: string } | null;
  }>[] = [];

  if (phone) {
    identityKeys.push(`phone:${phone}`);
    // phone_number only ever holds an OTP-confirmed number (unverified ones stage in
    // pending_phone_number), so tier >= 1 is implied — asserted here for clarity.
    siblingQueries.push(
      supabaseAdmin
        .from("user_kyc_profiles")
        .select("wallet_address, tier")
        .eq("phone_number", phone)
        .gte("tier", 1),
    );
  }

  if (hasId) {
    identityKeys.push(
      `id:${profile.id_country}:${profile.id_type}:${profile.id_number}`,
    );
    siblingQueries.push(
      supabaseAdmin
        .from("user_kyc_profiles")
        .select("wallet_address, tier")
        .eq("id_country", profile.id_country)
        .eq("id_type", profile.id_type)
        .eq("id_number", profile.id_number)
        .gte("tier", 2),
    );
  }

  const results = await Promise.all(siblingQueries);

  const wallets = new Set<string>([caller]);
  let effectiveTier = ownTier;

  for (const { data, error } of results) {
    if (error) {
      throw error;
    }
    for (const row of data ?? []) {
      const address = row.wallet_address?.trim().toLowerCase();
      if (!address) continue;
      wallets.add(address);
      effectiveTier = Math.max(effectiveTier, clampTier(row.tier));
    }
  }

  return {
    wallets: [...wallets].sort(),
    effectiveTier,
    identityKeys: identityKeys.sort(),
  };
}
