-- Exempt injected-wallet profiles from verified-identity uniqueness.
--
-- The uniqueness indexes added in 20260611120000 assume one wallet per person. That
-- holds for Privy embedded wallets but not for injected/bridge mode, where the user
-- brings their own external wallet: the same person legitimately arrives on several
-- addresses (an extension wallet on the main app, the host page's wallet on a partner
-- site) and every address after the first was hard-blocked at phone verification.
--
-- Uniqueness existed to stop one identity backing several wallets for several monthly
-- limits. 20260726120000 removed that motive by pooling spend per identity rather than
-- per wallet, so injected rows can safely leave the uniqueness set: no matter how many
-- wallets an identity spans, the group shares one allowance.
--
-- Injected rows are exempt in *both* directions — they neither collide with each other
-- nor block a Privy account from claiming the same number. Uniqueness continues to hold
-- among non-injected profiles exactly as before.

ALTER TABLE public.user_kyc_profiles
    ADD COLUMN IF NOT EXISTS is_injected_wallet boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_kyc_profiles.is_injected_wallet IS
  'Profile was created/updated from an injected-wallet (SIWE) session. Exempt from the '
  'verified phone/ID uniqueness indexes. Set once and never cleared: downgrading would '
  'pull the row back into the indexes and could fail an otherwise valid write with 23505.';

-- Backfill from the `injected-<address>` subject middleware already persists to user_id.
UPDATE public.user_kyc_profiles
   SET is_injected_wallet = true
 WHERE user_id LIKE 'injected-%'
   AND is_injected_wallet = false;

-- No duplicate-guard block is needed here (unlike 20260611120000): each new predicate
-- covers a strict subset of the rows the old one did, so recreation cannot fail on data
-- that already satisfied the stricter version.

DROP INDEX IF EXISTS uniq_user_kyc_profiles_verified_phone;
CREATE UNIQUE INDEX uniq_user_kyc_profiles_verified_phone
    ON public.user_kyc_profiles (phone_number)
 WHERE phone_number IS NOT NULL AND tier >= 1 AND NOT is_injected_wallet;

DROP INDEX IF EXISTS uniq_user_kyc_profiles_verified_id;
CREATE UNIQUE INDEX uniq_user_kyc_profiles_verified_id
    ON public.user_kyc_profiles (id_country, id_type, id_number)
 WHERE id_number IS NOT NULL AND tier >= 2 AND NOT is_injected_wallet;
