-- Noblocks Play (World Cup Fantasy League): permanent username on the user profile.
--
-- This is the single durable schema change of the campaign (PRD §9): the
-- username becomes the user's noblocks-wide identity and survives the
-- post-campaign teardown of all fantasy_* tables.

ALTER TABLE public.user_kyc_profiles
    ADD COLUMN IF NOT EXISTS username text NULL;

-- Unique case-insensitively; partial index so NULLs (users who never joined
-- the league) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_kyc_profiles_username_ci
    ON public.user_kyc_profiles (LOWER(username))
    WHERE username IS NOT NULL;

-- 3–20 chars, alphanumeric + underscore, no leading/trailing underscore.
ALTER TABLE public.user_kyc_profiles
    ADD CONSTRAINT user_kyc_profiles_username_format CHECK (
        username IS NULL
        OR username ~ '^[A-Za-z0-9][A-Za-z0-9_]{1,18}[A-Za-z0-9]$'
    );
