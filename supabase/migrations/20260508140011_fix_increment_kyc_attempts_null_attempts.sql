-- When `attempts` IS NULL, `attempts < p_max_attempts` is unknown (not TRUE), so the
-- UPDATE matched no rows and `increment_kyc_attempts` returned NULL. Clients then
-- showed "Maximum verification attempts reached" on the first Tier 2/Tier 3 try.

UPDATE public.user_kyc_profiles
SET attempts = 0
WHERE attempts IS NULL;

CREATE OR REPLACE FUNCTION public.increment_kyc_attempts(
  p_wallet_address text,
  p_max_attempts   integer DEFAULT 3
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempts integer;
BEGIN
  UPDATE public.user_kyc_profiles
     SET attempts = COALESCE(attempts, 0) + 1
   WHERE wallet_address = p_wallet_address
     AND COALESCE(attempts, 0) < p_max_attempts
  RETURNING attempts INTO v_attempts;

  RETURN v_attempts;
END;
$$;
