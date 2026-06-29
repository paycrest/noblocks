-- ─── Fix KYC limit enforcement status filters ─────────────────────────────────
--
-- Bug: offramp spend was counted only for status IN ('fulfilling', 'completed'),
-- but the app never writes 'fulfilling' — mapAggregatorStatusToDbStatus maps the
-- aggregator's "fulfilling" to 'pending' and "fulfilled" to 'fulfilled'. An offramp
-- therefore contributed $0 to monthly spend until the client-side poller persisted
-- a terminal 'completed', letting a follow-up onramp bypass the monthly limit.
--
-- Fix:
--   1. Count offramp spend for status IN ('pending', 'fulfilling', 'fulfilled',
--      'completed') — once an offramp order is created on-chain the funds are
--      committed, so pending orders must consume the limit. Refunded / refunding /
--      expired / failed rows stop counting as soon as that status is persisted.
--   2. Add 'fulfilled' to the onramp spend statuses for the same reason.
--   3. Relax the transactions.status CHECK constraint to the statuses the app
--      actually writes ('fulfilled', 'refunded', 'refunding', 'expired' were
--      missing), so status updates no longer violate the constraint.
--
-- Keep /api/kyc/transaction-summary in sync with the status lists below.

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check CHECK (
    status IN (
        'pending',
        'fulfilling',
        'fulfilled',
        'completed',
        'failed',
        'refunded',
        'refunding',
        'expired'
    )
);

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
  -- Statuses that consume the monthly limit: anything in-flight or settled.
  -- 'fulfilling' is legacy-only (the app maps the aggregator's "fulfilling"
  -- to 'pending') but is kept in case old rows carry it.
  v_spend_statuses      TEXT[] := ARRAY['pending', 'fulfilling', 'fulfilled', 'completed'];
BEGIN
  PERFORM set_config('search_path', 'public', true);

  PERFORM pg_advisory_xact_lock(hashtext(p_wallet_address));

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC');

  SELECT EXISTS (
    SELECT 1
    FROM transactions
    WHERE wallet_address   = p_wallet_address
      AND transaction_type = 'offramp'
      AND status           = ANY (v_spend_statuses)
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
        AND status           = ANY (v_spend_statuses)
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
    AND status           = ANY (v_spend_statuses)
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
    AND status           = ANY (v_spend_statuses)
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
