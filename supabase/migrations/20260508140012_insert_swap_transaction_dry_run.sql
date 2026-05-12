-- Add optional dry-run to insert_swap_transaction_if_within_limit so the API can
-- verify monthly KYC spend without inserting (used before on-chain createOrder).
-- Replace the 17-arg overload so callers get a single function identity.

DROP FUNCTION IF EXISTS public.insert_swap_transaction_if_within_limit(
  text, numeric, numeric, text, text, text, numeric, numeric, numeric,
  jsonb, text, text, text, text, text, text, text
);

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
  v_monthly_spent    NUMERIC := 0;
  v_this_tx_usd      NUMERIC;
  v_new_id           UUID;
  v_month_start      TIMESTAMPTZ;
  v_has_cngn_history BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_wallet_address));

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC');

  SELECT EXISTS (
    SELECT 1
    FROM transactions
    WHERE wallet_address   = p_wallet_address
      AND transaction_type = 'swap'
      AND status           IN ('fulfilling', 'completed')
      AND from_currency    = 'cNGN'
      AND created_at       >= v_month_start
  ) INTO v_has_cngn_history;

  IF (v_has_cngn_history OR p_from_currency = 'cNGN')
     AND (p_cngn_to_usd_rate IS NULL OR p_cngn_to_usd_rate <= 0) THEN
    RETURN jsonb_build_object('error', 'rate_unavailable');
  END IF;

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

  IF p_from_currency = 'cNGN' THEN
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
