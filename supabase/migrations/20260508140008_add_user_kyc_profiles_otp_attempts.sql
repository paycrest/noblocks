-- Idempotent migration for databases where user_kyc_profiles exists but predates otp_attempts
-- Fixes PostgREST PGRST204: Could not find the 'otp_attempts' column ...

ALTER TABLE public.user_kyc_profiles
  ADD COLUMN IF NOT EXISTS otp_attempts integer NOT NULL DEFAULT 0;

-- Phone OTP retry counter RPC (matches create_user_kyc_profiles.sql)

CREATE OR REPLACE FUNCTION public.increment_otp_attempts(
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
     SET otp_attempts = otp_attempts + 1
   WHERE wallet_address = p_wallet_address
     AND otp_attempts < p_max_attempts
  RETURNING otp_attempts INTO v_attempts;

  RETURN v_attempts;
END;
$$;
