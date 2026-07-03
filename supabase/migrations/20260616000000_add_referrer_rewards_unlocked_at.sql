-- Add referrer_rewards_unlocked_at to user_kyc_profiles
ALTER TABLE user_kyc_profiles
ADD COLUMN IF NOT EXISTS referrer_rewards_unlocked_at TIMESTAMPTZ;

-- Backfill: Users who already have a completed referrer claim are considered unlocked.
-- We set it to the MIN(updated_at) of their completed referral_claims where they were the referrer.
UPDATE user_kyc_profiles p
SET referrer_rewards_unlocked_at = COALESCE(
  p.referrer_rewards_unlocked_at,
  (
    SELECT MIN(rc.updated_at)
    FROM referral_claims rc
    JOIN referrals r ON r.id = rc.referral_id
    WHERE rc.wallet_address = p.wallet_address
      AND rc.status = 'completed'
      AND LOWER(r.referrer_wallet_address) = LOWER(p.wallet_address)
  )
)
WHERE p.referrer_rewards_unlocked_at IS NULL;
