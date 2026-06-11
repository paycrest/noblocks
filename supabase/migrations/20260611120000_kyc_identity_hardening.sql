-- KYC identity hardening:
--  1. `pending_phone_number` staging column so `phone_number` only ever holds a
--     number that passed OTP verification (previously an unverified replacement
--     number overwrote the verified one and was reported as verified).
--  2. Uniqueness for verified identities so one phone number / ID document
--     cannot back multiple wallet profiles (each wallet previously got its own
--     full monthly limit from the same identity).

-- ─── 1. Pending phone staging ─────────────────────────────────────────────────

ALTER TABLE public.user_kyc_profiles
    ADD COLUMN IF NOT EXISTS pending_phone_number text;

-- Backfill: `verified = true` is only ever set after a successful phone OTP or
-- a SmileID pass (which itself requires a verified phone), so an unverified
-- profile's phone_number has never been OTP-confirmed — stage it instead.
UPDATE public.user_kyc_profiles
   SET pending_phone_number = phone_number,
       phone_number         = NULL
 WHERE COALESCE(verified, false) = false
   AND phone_number IS NOT NULL;

-- ─── 2. Verified-identity uniqueness ──────────────────────────────────────────
-- Created conditionally: if historical duplicates exist they need a manual,
-- compliance-reviewed cleanup first — a migration must not decide which wallet
-- keeps the identity. The app also enforces this at verification time, so new
-- duplicates cannot be created either way.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.user_kyc_profiles
     WHERE phone_number IS NOT NULL
       AND tier >= 1
     GROUP BY phone_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'user_kyc_profiles: duplicate verified phone numbers exist; uniq_user_kyc_profiles_verified_phone NOT created. Clean up duplicates and re-run.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_kyc_profiles_verified_phone
        ON public.user_kyc_profiles (phone_number)
     WHERE phone_number IS NOT NULL AND tier >= 1;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.user_kyc_profiles
     WHERE id_number IS NOT NULL
       AND tier >= 2
     GROUP BY id_country, id_type, id_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'user_kyc_profiles: duplicate verified ID documents exist; uniq_user_kyc_profiles_verified_id NOT created. Clean up duplicates and re-run.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_kyc_profiles_verified_id
        ON public.user_kyc_profiles (id_country, id_type, id_number)
     WHERE id_number IS NOT NULL AND tier >= 2;
  END IF;
END $$;
