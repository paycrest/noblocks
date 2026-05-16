-- KYC profiles, OTP/KYC attempt RPCs, and monthly-limit transaction insert RPC.

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
    attempts            integer     NOT NULL DEFAULT 0,
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
-- Return values: >= 1 new count; -1 profile not found; -2 max attempts reached.

CREATE OR REPLACE FUNCTION public.increment_kyc_attempts(
  p_wallet_address text,
  p_max_attempts   integer DEFAULT 3
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempts integer;
  v_exists   boolean;
BEGIN
  UPDATE public.user_kyc_profiles
     SET attempts = COALESCE(attempts, 0) + 1
   WHERE wallet_address = p_wallet_address
     AND COALESCE(attempts, 0) < p_max_attempts
  RETURNING attempts INTO v_attempts;

  IF v_attempts IS NOT NULL THEN
    RETURN v_attempts;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.user_kyc_profiles
     WHERE wallet_address = p_wallet_address
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN -1;
  END IF;

  RETURN -2;
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
-- Atomically checks monthly KYC spend (onramp + offramp) and optionally inserts.
-- Returns { "id": uuid } | { "ok": true } (dry_run) | { "error": ... }.

CREATE OR REPLACE FUNCTION public.insert_swap_transaction_if_within_limit(
  p_wallet_address   TEXT,
  p_monthly_limit    NUMERIC,
  p_cngn_to_usd_rate NUMERIC,
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
  p_explorer_link    TEXT DEFAULT NULL,
  p_dry_run          BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_monthly_spent       NUMERIC := 0;
  v_offramp_spent       NUMERIC := 0;
  v_onramp_spent        NUMERIC := 0;
  v_this_tx_usd         NUMERIC;
  v_new_id              UUID;
  v_month_start         TIMESTAMPTZ;
  v_has_cngn_history    BOOLEAN;
  v_needs_fiat_rate     BOOLEAN;
  v_stable_to           TEXT[] := ARRAY['USDC', 'USDT', 'CUSD'];
BEGIN
  PERFORM set_config('search_path', 'public', true);

  PERFORM pg_advisory_xact_lock(hashtext(p_wallet_address));

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC');

  SELECT EXISTS (
    SELECT 1
    FROM transactions
    WHERE wallet_address   = p_wallet_address
      AND transaction_type = 'offramp'
      AND status           IN ('fulfilling', 'completed')
      AND upper(coalesce(from_currency, '')) = 'CNGN'
      AND created_at       >= v_month_start
  ) INTO v_has_cngn_history;

  v_needs_fiat_rate := (
    v_has_cngn_history
    OR upper(coalesce(p_from_currency, '')) = 'CNGN'
    OR upper(coalesce(p_to_currency, '')) = 'CNGN'
    OR EXISTS (
      SELECT 1
      FROM transactions
      WHERE wallet_address   = p_wallet_address
        AND transaction_type = 'onramp'
        AND status           IN ('pending', 'fulfilling', 'completed')
        AND created_at       >= v_month_start
        AND upper(coalesce(to_currency, '')) NOT IN ('USDC', 'USDT', 'CUSD', 'CNGN')
    )
    OR (
      p_transaction_type = 'onramp'
      AND upper(coalesce(p_to_currency, '')) NOT IN ('USDC', 'USDT', 'CUSD', 'CNGN')
    )
  );

  IF v_needs_fiat_rate AND (p_cngn_to_usd_rate IS NULL OR p_cngn_to_usd_rate <= 0) THEN
    RETURN jsonb_build_object('error', 'rate_unavailable');
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN upper(coalesce(from_currency, '')) = 'CNGN' THEN amount_sent::NUMERIC / p_cngn_to_usd_rate
      ELSE amount_sent::NUMERIC
    END
  ), 0)
  INTO v_offramp_spent
  FROM transactions
  WHERE wallet_address   = p_wallet_address
    AND transaction_type = 'offramp'
    AND status           IN ('fulfilling', 'completed')
    AND upper(coalesce(from_currency, '')) IN ('USDC', 'USDT', 'CUSD', 'CNGN')
    AND created_at       >= v_month_start;

  SELECT COALESCE(SUM(
    CASE
      WHEN upper(coalesce(to_currency, '')) = ANY (v_stable_to) THEN amount_received::NUMERIC
      WHEN upper(coalesce(to_currency, '')) = 'CNGN' THEN amount_received::NUMERIC / p_cngn_to_usd_rate
      WHEN upper(coalesce(from_currency, '')) NOT IN ('USDC', 'USDT', 'CUSD', 'CNGN')
        THEN amount_sent::NUMERIC / p_cngn_to_usd_rate
      ELSE amount_received::NUMERIC
    END
  ), 0)
  INTO v_onramp_spent
  FROM transactions
  WHERE wallet_address   = p_wallet_address
    AND transaction_type = 'onramp'
    AND status           IN ('pending', 'fulfilling', 'completed')
    AND created_at       >= v_month_start;

  v_monthly_spent := v_offramp_spent + v_onramp_spent;

  IF p_transaction_type = 'onramp' THEN
    IF upper(coalesce(p_to_currency, '')) = ANY (v_stable_to) THEN
      v_this_tx_usd := p_amount_received;
    ELSIF upper(coalesce(p_to_currency, '')) = 'CNGN' THEN
      v_this_tx_usd := p_amount_received / p_cngn_to_usd_rate;
    ELSIF upper(coalesce(p_from_currency, '')) NOT IN ('USDC', 'USDT', 'CUSD', 'CNGN') THEN
      v_this_tx_usd := p_amount_sent / p_cngn_to_usd_rate;
    ELSE
      v_this_tx_usd := p_amount_received;
    END IF;
  ELSIF upper(coalesce(p_from_currency, '')) = 'CNGN' THEN
    v_this_tx_usd := p_amount_sent / p_cngn_to_usd_rate;
  ELSE
    v_this_tx_usd := p_amount_sent;
  END IF;

  IF v_monthly_spent + v_this_tx_usd > p_monthly_limit THEN
    RETURN jsonb_build_object(
      'error',         'limit_exceeded',
      'monthly_spent', v_monthly_spent,
      'this_tx_usd',   v_this_tx_usd,
      'monthly_limit', p_monthly_limit
    );
  END IF;

  IF COALESCE(p_dry_run, FALSE) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

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

GRANT EXECUTE ON FUNCTION public.insert_swap_transaction_if_within_limit TO service_role;
