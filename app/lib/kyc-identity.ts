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
 * The exact character set the SQL copies of this expression strip, spelled out
 * rather than using `\s` or `String.trim()`.
 *
 * `\s` and `trim()` in JS also match NBSP, BOM and the Unicode space separators;
 * Postgres `[[:space:]]` matches only these six. Using either JS shorthand would
 * make a tab- or NBSP-padded value canonicalize one way in the app and another
 * way in the generated column — one identity, two keys, which is the exact
 * failure this canonicalization exists to prevent. (`btrim(x)` with no second
 * argument is worse still: it strips spaces only.)
 *
 * Applied to the whole string, not just the ends, so internal spacing variants
 * ("A 123 456" vs "A123456") also collapse together.
 */
const SQL_SPACE_CLASS = /[ \t\n\v\f\r]/g;

function normalizeIdPart(value: string): string {
  return value.toUpperCase().replace(SQL_SPACE_CLASS, "");
}

/** Edge-trim only, over the same character set — the phone counterpart. */
function trimSqlSpace(value: string): string {
  return value.replace(/^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g, "");
}

/**
 * Canonical form of an ID document: uppercased with whitespace stripped.
 * Returns null unless all three parts are present — a partial triple would
 * collide across every holder of that document type in a country.
 *
 * The id_* columns store raw input (app/api/kyc/smile-id/route.ts falls back to
 * the client-supplied number when the provider returns none), so the same
 * document can arrive spelled several ways. Everything that has to recognise two
 * profiles as one identity — sibling matching, advisory lock keys, the referral
 * fingerprint indexes — keys on this instead of the raw values.
 *
 * Must stay in sync with two SQL copies of this expression:
 *   * the `identity_id_key` generated column (20260817180400), which is what
 *     sibling lookups match against
 *   * the referral fingerprint backfill (20260817180100)
 */
export function buildIdentityIdKey(
  country: string | null | undefined,
  type: string | null | undefined,
  number: string | null | undefined,
): string | null {
  if (!country || !type || !number) return null;
  return `${normalizeIdPart(country)}:${normalizeIdPart(type)}:${normalizeIdPart(number)}`;
}

/**
 * Fingerprints a single wallet's own verified phone/ID — no sibling lookup.
 *
 * Used to key identity-scoped uniqueness constraints (referral submission and
 * referee-reward claims) on the same two dimensions `resolveIdentityScope`
 * pools on, without paying for the sibling query when only the caller's own
 * values are needed.
 *
 * `phone_number` is already E.164-canonical on write; the ID triple is
 * canonicalized via `buildIdentityIdKey` because these values feed unique
 * indexes, where two spellings of one document would slip past as two rows.
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

  return {
    phone: profile?.phone_number
      ? trimSqlSpace(profile.phone_number) || null
      : null,
    idKey: buildIdentityIdKey(
      profile?.id_country,
      profile?.id_type,
      profile?.id_number,
    ),
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
  // Canonical, not the raw triple: two spellings of one document must resolve to
  // one identity, or siblings get separate allowances and serialize on separate
  // advisory locks. See buildIdentityIdKey and 20260817180400.
  const idKey = buildIdentityIdKey(
    profile?.id_country,
    profile?.id_type,
    profile?.id_number,
  );

  if (!profile || (!phone && !idKey)) {
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

  if (idKey) {
    identityKeys.push(`id:${idKey}`);
    // Matches the generated `identity_id_key` column rather than the raw triple,
    // so a document spelled differently on two profiles still pools them.
    siblingQueries.push(
      supabaseAdmin
        .from("user_kyc_profiles")
        .select("wallet_address, tier")
        .eq("identity_id_key", idKey)
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
  // Wallets are symmetric across a group; identityKeys are not (phone-only vs phone+ID).
  return [...scope.wallets].sort().join("|") || `wallet:${scope.wallets[0]}`;
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
  const idTriples = new Map<
    string,
    { id_country: string; id_type: string; id_number: string }
  >();
  for (const wallet of callers) {
    const profile = profilesByWallet.get(wallet);
    if (profile?.phone_number) phones.add(profile.phone_number);
    if (profile?.id_country && profile?.id_type && profile?.id_number) {
      const key = `id:${profile.id_country}:${profile.id_type}:${profile.id_number}`;
      idTriples.set(key, {
        id_country: profile.id_country,
        id_type: profile.id_type,
        id_number: profile.id_number,
      });
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
  for (const [, triple] of idTriples) {
    const { id_country, id_type, id_number } = triple;
    const key = `id:${id_country}:${id_type}:${id_number}`;
    const { data, error } = await supabaseAdmin
      .from("user_kyc_profiles")
      .select("wallet_address, tier")
      .eq("id_country", id_country)
      .eq("id_type", id_type)
      .eq("id_number", id_number)
      .gte("tier", 2);
    if (error) throw error;
    siblingsById.set(key, (data ?? []) as SiblingRow[]);
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
      const idKey = `id:${profile.id_country}:${profile.id_type}:${profile.id_number}`;
      identityKeys.push(idKey);
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
