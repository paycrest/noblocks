-- One referral submission per referred wallet (enforced atomically on INSERT).
-- Case-insensitive so mixed-case legacy rows cannot bypass the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_wallet_address_unique
  ON public.referrals (lower(referred_wallet_address));
