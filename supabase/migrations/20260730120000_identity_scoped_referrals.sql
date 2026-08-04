-- Identity-scoped referral reward dedup.
--
-- Referral submission and referee-reward claims were keyed strictly per wallet
-- address, so one person holding several wallets sharing a verified phone/ID
-- could accept N referral codes and collect N "welcome" rewards. Spend limits
-- were already pooled per verified identity (see 20260726120000), but rewards
-- were not.
--
-- Referral codes are submitted immediately after wallet connect, before any
-- KYC — so a fresh sibling wallet's phone/ID fingerprint is essentially always
-- NULL at submission time. Fingerprint columns on `referrals` therefore only
-- catch the rarer case where a fingerprint is already known at submit time
-- (defense in depth); the real enforcement lives on `referral_claims`, where
-- fingerprints are guaranteed known (checkPartyQualification already requires
-- tier >= 1 before a claim proceeds).
--
-- Both tables get the same shape: two nullable columns, each with its own
-- partial unique index (NULL values excluded). A wallet with neither a
-- verified phone nor ID (tier 0) leaves both columns NULL and falls back to
-- the pre-existing per-wallet unique indexes — see referrals_referred_wallet_address_unique.
--
-- Fingerprint normalization (must stay in sync with
-- `resolveOwnIdentityFingerprint` in app/lib/kyc-identity.ts):
--   phone  → btrim(phone_number)          (already E.164-canonical on write)
--   id key → upper(btrim(country)) : upper(btrim(type)) : upper(btrim(number)) minus whitespace
-- The stored id_* values are raw client input, so without normalization the
-- same document could produce distinct fingerprints ("NG:passport:A 123" vs
-- "ng:PASSPORT:a123") and both inserts would slip past the unique indexes.

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS identity_phone TEXT,
  ADD COLUMN IF NOT EXISTS identity_id_key TEXT;

ALTER TABLE public.referral_claims
  ADD COLUMN IF NOT EXISTS identity_phone TEXT,
  ADD COLUMN IF NOT EXISTS identity_id_key TEXT;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Pre-existing rows must participate in the constraints, or every identity that
-- was referred before this migration could be referred again through a fresh
-- sibling wallet — NULL fingerprints are excluded from the partial indexes, and
-- that population is exactly where existing abuse would live. Fingerprints come
-- from the referred wallet's KYC profile, matched on lowercased address.

UPDATE public.referrals r
   SET identity_phone  = NULLIF(btrim(p.phone_number), ''),
       identity_id_key = CASE
         WHEN p.id_country IS NOT NULL AND p.id_type IS NOT NULL AND p.id_number IS NOT NULL
         THEN upper(btrim(p.id_country)) || ':' || upper(btrim(p.id_type)) || ':'
              || regexp_replace(upper(btrim(p.id_number)), '\s', '', 'g')
       END
  FROM public.user_kyc_profiles p
 WHERE lower(p.wallet_address) = lower(r.referred_wallet_address)
   AND r.identity_phone IS NULL
   AND r.identity_id_key IS NULL;

-- Only referee-side claim rows carry fingerprints (a referrer legitimately
-- earns on many referrals), so the claim backfill is restricted to rows whose
-- wallet is the referral's referred party.
UPDATE public.referral_claims c
   SET identity_phone  = NULLIF(btrim(p.phone_number), ''),
       identity_id_key = CASE
         WHEN p.id_country IS NOT NULL AND p.id_type IS NOT NULL AND p.id_number IS NOT NULL
         THEN upper(btrim(p.id_country)) || ':' || upper(btrim(p.id_type)) || ':'
              || regexp_replace(upper(btrim(p.id_number)), '\s', '', 'g')
       END
  FROM public.referrals r
  JOIN public.user_kyc_profiles p
    ON lower(p.wallet_address) = lower(r.referred_wallet_address)
 WHERE c.referral_id = r.id
   AND lower(c.wallet_address) = lower(r.referred_wallet_address)
   AND c.identity_phone IS NULL
   AND c.identity_id_key IS NULL;

-- ── Deduplicate before creating the unique indexes ──────────────────────────
-- Historical duplicates (the double rewards this change exists to stop) would
-- make CREATE UNIQUE INDEX fail outright. Resolution: the earliest row keeps
-- its fingerprint, later rows have it NULLed — the rows themselves are kept
-- (they record payouts that really happened), they just stop occupying the
-- identity's one slot. For claims, a completed row wins over pending/failed
-- regardless of age: the paid claim is the one that must hold the slot.

WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY identity_phone ORDER BY created_at, id
         ) AS rn
    FROM public.referrals
   WHERE identity_phone IS NOT NULL
)
UPDATE public.referrals r
   SET identity_phone = NULL
  FROM ranked
 WHERE r.id = ranked.id AND ranked.rn > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY identity_id_key ORDER BY created_at, id
         ) AS rn
    FROM public.referrals
   WHERE identity_id_key IS NOT NULL
)
UPDATE public.referrals r
   SET identity_id_key = NULL
  FROM ranked
 WHERE r.id = ranked.id AND ranked.rn > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY identity_phone
           ORDER BY (status = 'completed') DESC, updated_at, id
         ) AS rn
    FROM public.referral_claims
   WHERE identity_phone IS NOT NULL
)
UPDATE public.referral_claims c
   SET identity_phone = NULL
  FROM ranked
 WHERE c.id = ranked.id AND ranked.rn > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (
           PARTITION BY identity_id_key
           ORDER BY (status = 'completed') DESC, updated_at, id
         ) AS rn
    FROM public.referral_claims
   WHERE identity_id_key IS NOT NULL
)
UPDATE public.referral_claims c
   SET identity_id_key = NULL
  FROM ranked
 WHERE c.id = ranked.id AND ranked.rn > 1;

-- ── Unique indexes ──────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS referrals_identity_phone_unique
  ON public.referrals (identity_phone) WHERE identity_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS referrals_identity_id_key_unique
  ON public.referrals (identity_id_key) WHERE identity_id_key IS NOT NULL;

-- referral_claims rows serve both referrer-side and referee-side claims (same
-- table, disambiguated by wallet_address). Only referee-side inserts populate
-- these two columns, so the partial indexes only ever constrain referee
-- claims — a referrer earning independently on multiple referrals never
-- touches this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS referral_claims_referee_identity_phone_unique
  ON public.referral_claims (identity_phone) WHERE identity_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS referral_claims_referee_identity_id_key_unique
  ON public.referral_claims (identity_id_key) WHERE identity_id_key IS NOT NULL;
