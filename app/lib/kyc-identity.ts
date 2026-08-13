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

/** Dedupe key for one-team-per-person rules (e.g. fantasy challenge winners). */
export function identityDedupeKey(scope: IdentityScope): string {
  return [...scope.identityKeys].sort().join("|") || `wallet:${scope.wallets[0]}`;
}

type ProfileRow = {
  wallet_address: string;
  tier: number | null;
  phone_number: string | null;
  id_country: string | null;
  id_type: string | null;
  id_number: string | null;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Batch resolveIdentityScope for many wallets with shared sibling queries. */
export async function resolveIdentityScopes(
  walletAddresses: string[],
): Promise<Map<string, IdentityScope>> {
  const callers = [
    ...new Set(
      walletAddresses.map((w) => w.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  const result = new Map<string, IdentityScope>();
  if (callers.length === 0) return result;

  const profilesByWallet = new Map<string, ProfileRow>();
  for (const batch of chunk(callers, 100)) {
    const { data, error } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("wallet_address, tier, phone_number, id_country, id_type, id_number")
      .in("wallet_address", batch);
    if (error) throw error;
    for (const row of data ?? []) {
      const wallet = row.wallet_address?.trim().toLowerCase();
      if (wallet) profilesByWallet.set(wallet, row as ProfileRow);
    }
  }

  const phones = new Set<string>();
  const idTriples = new Set<string>();
  for (const wallet of callers) {
    const profile = profilesByWallet.get(wallet);
    if (profile?.phone_number) phones.add(profile.phone_number);
    if (profile?.id_country && profile?.id_type && profile?.id_number) {
      idTriples.add(
        `${profile.id_country}:${profile.id_type}:${profile.id_number}`,
      );
    }
  }

  const siblingsByPhone = new Map<string, SiblingRow[]>();
  for (const phone of phones) {
    const { data, error } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("wallet_address, tier")
      .eq("phone_number", phone)
      .gte("tier", 1);
    if (error) throw error;
    siblingsByPhone.set(phone, (data ?? []) as SiblingRow[]);
  }

  const siblingsById = new Map<string, SiblingRow[]>();
  for (const triple of idTriples) {
    const [id_country, id_type, id_number] = triple.split(":");
    const { data, error } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("wallet_address, tier")
      .eq("id_country", id_country)
      .eq("id_type", id_type)
      .eq("id_number", id_number)
      .gte("tier", 2);
    if (error) throw error;
    siblingsById.set(triple, (data ?? []) as SiblingRow[]);
  }

  for (const caller of callers) {
    const profile = profilesByWallet.get(caller);
    const ownTier = clampTier(profile?.tier);
    const phone = profile?.phone_number || null;
    const hasId = !!(profile?.id_country && profile?.id_type && profile?.id_number);

    if (!profile || (!phone && !hasId)) {
      result.set(caller, {
        wallets: [caller],
        effectiveTier: ownTier,
        identityKeys: [`wallet:${caller}`],
      });
      continue;
    }

    const identityKeys: string[] = [];
    const wallets = new Set<string>([caller]);
    let effectiveTier = ownTier;

    if (phone) {
      identityKeys.push(`phone:${phone}`);
      for (const row of siblingsByPhone.get(phone) ?? []) {
        const address = row.wallet_address?.trim().toLowerCase();
        if (!address) continue;
        wallets.add(address);
        effectiveTier = Math.max(effectiveTier, clampTier(row.tier));
      }
    }

    if (hasId) {
      const idKey = `${profile.id_country}:${profile.id_type}:${profile.id_number}`;
      identityKeys.push(`id:${idKey}`);
      for (const row of siblingsById.get(idKey) ?? []) {
        const address = row.wallet_address?.trim().toLowerCase();
        if (!address) continue;
        wallets.add(address);
        effectiveTier = Math.max(effectiveTier, clampTier(row.tier));
      }
    }

    result.set(caller, {
      wallets: [...wallets].sort(),
      effectiveTier,
      identityKeys: identityKeys.sort(),
    });
  }

  return result;
}
