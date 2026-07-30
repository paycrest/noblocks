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

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS identity_phone TEXT,
  ADD COLUMN IF NOT EXISTS identity_id_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS referrals_identity_phone_unique
  ON public.referrals (identity_phone) WHERE identity_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS referrals_identity_id_key_unique
  ON public.referrals (identity_id_key) WHERE identity_id_key IS NOT NULL;

-- referral_claims rows serve both referrer-side and referee-side claims (same
-- table, disambiguated by wallet_address). Only referee-side inserts populate
-- these two columns, so the partial indexes only ever constrain referee
-- claims — a referrer earning independently on multiple referrals never
-- touches this constraint.
ALTER TABLE public.referral_claims
  ADD COLUMN IF NOT EXISTS identity_phone TEXT,
  ADD COLUMN IF NOT EXISTS identity_id_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS referral_claims_referee_identity_phone_unique
  ON public.referral_claims (identity_phone) WHERE identity_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS referral_claims_referee_identity_id_key_unique
  ON public.referral_claims (identity_id_key) WHERE identity_id_key IS NOT NULL;
