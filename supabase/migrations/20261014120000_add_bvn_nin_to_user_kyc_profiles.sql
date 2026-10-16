-- Nigerian national identifiers for on-ramp KYC (KAN-870).
--
-- An NGN on-ramp order must carry the customer's BVN or NIN. A user verified with a passport or
-- driver's licence keeps that document in id_type / id_number / id_country (it backs their tier
-- and the identity-uniqueness index); the BVN or NIN confirmed by the on-ramp identity check is
-- stored alongside it here instead of replacing it.
--
-- Expand only: nullable columns, no backfill. No unique index: sibling wallets of one identity
-- (see app/lib/kyc-identity.ts) may legitimately share a number, so "one number per identity"
-- is enforced by the identity check, which claims the number, then re-checks for another holder
-- before writing anything else.
-- Code that does not know the columns keeps working.

ALTER TABLE public.user_kyc_profiles
  ADD COLUMN IF NOT EXISTS bvn TEXT,
  ADD COLUMN IF NOT EXISTS nin TEXT;

COMMENT ON COLUMN public.user_kyc_profiles.bvn IS
  'BVN confirmed by a Smile ID ID-number check for on-ramp KYC. Never returned to clients.';

COMMENT ON COLUMN public.user_kyc_profiles.nin IS
  'NIN confirmed by a Smile ID ID-number check for on-ramp KYC. Never returned to clients.';
