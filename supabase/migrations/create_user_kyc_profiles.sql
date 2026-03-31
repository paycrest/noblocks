-- KYC profiles table and all associated functions, indexes, and RLS.
-- Consolidated from: create_user_kyc_profiles.sql, add_increment_kyc_attempts_function.sql,
--                    add_otp_attempts_column.sql, and atomic_swap_transaction.sql

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE public.user_kyc_profiles (
    wallet_address      text        NOT NULL,
    user_id             text        NULL,
    phone_number        text        NULL,
    email_address       text        NULL,
    full_name           text        NULL,
    date_of_birth       date        NULL,
    id_type             text        NULL,
    id_number           text        NULL,
    id_country          text        NULL,
    address_street      text        NULL,
    address_city        text        NULL,
    address_state       text        NULL,
    address_country     text        NULL,
    address_postal_code text        NULL,
    business_name       text        NULL,
    platform            jsonb       NULL    DEFAULT '[]'::jsonb,
    otp_code            text        NULL,
    expires_at          timestamp with time zone NULL,
    provider            text        NULL,
    -- SmileID / document-verification attempt counter
    attempts            integer     NULL    DEFAULT 0,
    -- Phone OTP attempt counter (independent of the document counter)
    otp_attempts        integer     NOT NULL DEFAULT 0,
    tier                integer     NOT NULL DEFAULT 0,
    verified            boolean     NULL    DEFAULT false,
    verified_at         timestamp with time zone NULL,
    created_at          timestamp with time zone NULL DEFAULT now(),
    updated_at          timestamp with time zone NULL DEFAULT now(),

    CONSTRAINT user_kyc_profiles_pkey PRIMARY KEY (wallet_address),
    CONSTRAINT user_kyc_profiles_provider_check CHECK (
        provider = ANY (ARRAY['kudisms'::text, 'twilio'::text])
    ),
    CONSTRAINT user_kyc_profiles_tier_check CHECK (
        tier = ANY (ARRAY[0, 1, 2, 3, 4])
    )
) TABLESPACE pg_default;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_kyc_profiles_tier
    ON public.user_kyc_profiles USING btree (tier) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_user_kyc_profiles_id_number
    ON public.user_kyc_profiles USING btree (id_number) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_user_kyc_profiles_platform
    ON public.user_kyc_profiles USING gin (platform) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_user_kyc_profiles_user_id
    ON public.user_kyc_profiles USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_user_kyc_profiles_phone
    ON public.user_kyc_profiles USING btree (phone_number) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_user_kyc_profiles_email
    ON public.user_kyc_profiles USING btree (email_address) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_user_kyc_profiles_verified
    ON public.user_kyc_profiles USING btree (verified) TABLESPACE pg_default;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_user_kyc_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_user_kyc_profiles_updated_at
  BEFORE UPDATE ON user_kyc_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_kyc_profiles_updated_at();

-- ─── Row-level security ───────────────────────────────────────────────────────

-- Deny all direct client access; backend uses supabaseAdmin (service_role)
-- which bypasses RLS entirely.
ALTER TABLE public.user_kyc_profiles ENABLE ROW LEVEL SECURITY;

-- ─── increment_kyc_attempts ───────────────────────────────────────────────────
-- Increments the SmileID / document-verification attempt counter.
-- Returns the new count, or NULL if the max has already been reached.

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
     SET attempts = attempts + 1
   WHERE wallet_address = p_wallet_address
     AND attempts < p_max_attempts
  RETURNING attempts INTO v_attempts;

  RETURN v_attempts;
END;
$$;

-- ─── increment_otp_attempts ───────────────────────────────────────────────────
-- Increments the phone OTP attempt counter independently of the document counter.
-- Returns the new count, or NULL if the max has already been reached.

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

-- ─── insert_swap_transaction_if_within_limit ──────────────────────────────────
-- Atomically checks the monthly KYC spend limit and inserts a swap transaction.
-- Uses pg_advisory_xact_lock to serialize concurrent inserts for the same wallet,
-- preventing the race condition where two requests both pass the limit check
-- before either insert is committed.
--
-- Returns a JSONB object:
--   { "id": "<uuid>" }               — success
--   { "error": "limit_exceeded" }    — spend limit would be breached
--   { "error": "rate_unavailable" }  — cNGN rate needed but not provided
--
-- Pass p_cngn_to_usd_rate = 0 when no cNGN is involved; the function treats
-- any value <= 0 as "unavailable" and returns rate_unavailable if cNGN appears
-- in the current transaction or in the wallet's history for this month.

CREATE OR REPLACE FUNCTION public.insert_swap_transaction_if_within_limit(
  p_wallet_address   TEXT,
  p_monthly_limit    NUMERIC,
  p_cngn_to_usd_rate NUMERIC,
  -- Transaction fields
  p_transaction_type TEXT,
  p_from_currency    TEXT,
  p_to_currency      TEXT,
  p_amount_sent      NUMERIC,
  p_amount_received  NUMERIC,
  p_fee              NUMERIC,
  p_recipient        JSONB,
  p_status           TEXT,
  p_network          TEXT DEFAULT NULL,
  p_time_spent       TEXT DEFAULT NULL,
  p_tx_hash          TEXT DEFAULT NULL,
  p_order_id         TEXT DEFAULT NULL,
  p_email            TEXT DEFAULT NULL,
  p_explorer_link    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_monthly_spent    NUMERIC := 0;
  v_this_tx_usd      NUMERIC;
  v_new_id           UUID;
  v_month_start      TIMESTAMPTZ;
  v_has_cngn_history BOOLEAN;
BEGIN
  -- Serialize concurrent inserts for this wallet address
  PERFORM pg_advisory_xact_lock(hashtext(p_wallet_address));

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC');

  -- Check for historical cNGN transactions this month
  SELECT EXISTS (
    SELECT 1
    FROM transactions
    WHERE wallet_address   = p_wallet_address
      AND transaction_type = 'swap'
      AND status           IN ('fulfilling', 'completed')
      AND from_currency    = 'cNGN'
      AND created_at       >= v_month_start
  ) INTO v_has_cngn_history;

  -- Refuse if cNGN rate is needed but unavailable (prevents undercounting spend)
  IF (v_has_cngn_history OR p_from_currency = 'cNGN')
     AND (p_cngn_to_usd_rate IS NULL OR p_cngn_to_usd_rate <= 0) THEN
    RETURN jsonb_build_object('error', 'rate_unavailable');
  END IF;

  -- Sum monthly spend in USD
  SELECT COALESCE(SUM(
    CASE
      WHEN from_currency = 'cNGN' THEN amount_sent::NUMERIC / p_cngn_to_usd_rate
      ELSE amount_sent::NUMERIC
    END
  ), 0)
  INTO v_monthly_spent
  FROM transactions
  WHERE wallet_address   = p_wallet_address
    AND transaction_type = 'swap'
    AND status           IN ('fulfilling', 'completed')
    AND from_currency    IN ('USDC', 'USDT', 'cUSD', 'cNGN')
    AND created_at       >= v_month_start;

  -- Convert this transaction's amount to USD
  IF p_from_currency = 'cNGN' THEN
    v_this_tx_usd := p_amount_sent / p_cngn_to_usd_rate;
  ELSE
    v_this_tx_usd := p_amount_sent;
  END IF;

  -- Enforce monthly limit
  IF v_monthly_spent + v_this_tx_usd > p_monthly_limit THEN
    RETURN jsonb_build_object(
      'error',         'limit_exceeded',
      'monthly_spent', v_monthly_spent,
      'this_tx_usd',   v_this_tx_usd,
      'monthly_limit', p_monthly_limit
    );
  END IF;

  -- Insert transaction atomically (within the same advisory-locked transaction)
  INSERT INTO transactions (
    wallet_address, transaction_type, from_currency, to_currency,
    amount_sent, amount_received, fee, recipient, status, network,
    time_spent, tx_hash, order_id, email, explorer_link
  ) VALUES (
    p_wallet_address, p_transaction_type, p_from_currency, p_to_currency,
    p_amount_sent, p_amount_received, p_fee, p_recipient, p_status, p_network,
    p_time_spent, p_tx_hash, p_order_id, p_email, p_explorer_link
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('id', v_new_id);
END;
$$;

-- Only the service_role backend may call this function
GRANT EXECUTE ON FUNCTION public.insert_swap_transaction_if_within_limit TO service_role;
