import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveIdentityScope } from "@/app/lib/kyc-identity";
import type { OnrampKycProfile } from "@/app/lib/onramp-kyc";

type ProfileRow = {
  wallet_address: string;
  tier: number | null;
  full_name: string | null;
  date_of_birth: string | null;
  id_type: string | null;
  id_number: string | null;
  id_country: string | null;
  bvn: string | null;
  nin: string | null;
  phone_number: string | null;
};

const COLUMNS =
  "wallet_address, tier, full_name, date_of_birth, id_type, id_number, id_country, bvn, nin, phone_number";

/**
 * The on-ramp KYC profile of the identity a wallet belongs to. One person may hold several
 * wallets (see kyc-identity.ts) and may have verified on any of them, so fields missing on the
 * caller's row are taken from its verified siblings; the caller's own values win. The tier is
 * the identity's effective tier.
 *
 * Throws on a database error: callers must fail closed rather than treat it as "no KYC".
 */
export async function loadOnrampKycProfile(walletAddress: string): Promise<OnrampKycProfile> {
  const caller = walletAddress.trim().toLowerCase();
  const scope = await resolveIdentityScope(caller);

  const { data, error } = await supabaseAdmin
    .from("user_kyc_profiles")
    .select(COLUMNS)
    .in("wallet_address", scope.wallets);
  if (error) throw error;

  const rows = (data ?? []) as ProfileRow[];
  // The caller first, then verified siblings, highest tier first.
  rows.sort((a, b) => {
    if (a.wallet_address === caller) return -1;
    if (b.wallet_address === caller) return 1;
    return (b.tier ?? 0) - (a.tier ?? 0);
  });
  const usable = rows.filter((r) => r.wallet_address === caller || (r.tier ?? 0) >= 2);
  const first = (pick: (r: ProfileRow) => string | null): string | null => {
    for (const r of usable) {
      const v = pick(r);
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };

  // The identity document travels as one unit: type, number and country from the same row.
  const docRow = usable.find((r) => r.id_type && r.id_number && r.id_country) ?? null;

  return {
    tier: scope.effectiveTier,
    fullName: first((r) => r.full_name),
    dateOfBirth: first((r) => r.date_of_birth),
    idType: docRow?.id_type ?? null,
    idNumber: docRow?.id_number ?? null,
    idCountry: docRow?.id_country ?? null,
    bvn: first((r) => r.bvn),
    nin: first((r) => r.nin),
    phoneNumber: first((r) => r.phone_number),
  };
}
