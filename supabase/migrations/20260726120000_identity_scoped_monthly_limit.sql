-- Identity-scoped monthly limits.
--
-- The monthly spend cap previously belonged to a single wallet: spend was summed over
-- `wallet_address = p_wallet_address` and the advisory lock was taken on that address.
-- One person holding several wallets therefore got a full, independent allowance for
-- each — and the phone/ID uniqueness indexes were the only thing keeping that from
-- being farmed at will.
--
-- The pool now belongs to the verified *identity* (phone number and/or ID document).
-- Callers pass the set of wallets sharing that identity (`p_scope_wallets`, resolved by
-- `app/lib/kyc-identity.ts`) and the identity's lock keys (`p_identity_keys`); spend is
-- aggregated across the whole set. Wallet count stops affecting total spend, which is
-- what makes exempting injected wallets from the uniqueness indexes safe.
--
-- Both new parameters default to the previous per-wallet behavior, so any caller that
-- has not been updated keeps working unchanged.

-- The parameter list grows, so the old signature must be dropped rather than replaced:
-- CREATE OR REPLACE with extra defaulted parameters registers a second overload, and
-- an 18-argument call would then match both and fail as "function is not unique".
DROP FUNCTION IF EXISTS public.insert_swap_transaction_if_within_limit(
  TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN
);

CREATE FUNCTION public.insert_swap_transaction_if_within_limit(
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
  p_dry_run          BOOLEAN DEFAULT FALSE,
  -- Wallets sharing the caller's verified identity. NULL → just the caller.
  p_scope_wallets    TEXT[] DEFAULT NULL,
  -- Advisory-lock keys for that identity. NULL → the caller's own wallet key.
  p_identity_keys    TEXT[] DEFAULT NULL
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
  v_scope_wallets       TEXT[];
  v_sorted_keys         TEXT[];
  v_key                 TEXT;
BEGIN
  PERFORM set_config('search_path', 'public', true);

  -- Always include the caller, and dedupe: a caller that passes a stale or partial
  -- scope must never end up with a *narrower* pool than its own wallet.
  SELECT COALESCE(array_agg(DISTINCT w), ARRAY[p_wallet_address])
    INTO v_scope_wallets
    FROM unnest(
           COALESCE(p_scope_wallets, ARRAY[]::TEXT[]) || ARRAY[p_wallet_address]
         ) AS w;

  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY['wallet:' || p_wallet_address])
    INTO v_sorted_keys
    FROM unnest(COALESCE(p_identity_keys, ARRAY[]::TEXT[])) AS k;

  -- Lock the identity, not the wallet: sibling wallets sharing a pool must serialize
  -- against each other, or two concurrent swaps that individually fit will both pass
  -- the check and together exceed the cap. Keys are taken in sorted order so a
  -- transaction holding the phone key and one holding the ID key cannot deadlock.
  FOREACH v_key IN ARRAY v_sorted_keys LOOP
    PERFORM pg_advisory_xact_lock(hashtext(v_key));
  END LOOP;

  -- Capped tiers run the full rate + spend + limit check. An unlimited tier
  -- (p_monthly_limit IS NULL) skips straight to the insert/dry-run tail.
  IF p_monthly_limit IS NOT NULL THEN
    v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC');

    SELECT EXISTS (
      SELECT 1
      FROM transactions
      WHERE wallet_address   = ANY (v_scope_wallets)
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
        WHERE wallet_address   = ANY (v_scope_wallets)
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
    WHERE wallet_address   = ANY (v_scope_wallets)
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
    WHERE wallet_address   = ANY (v_scope_wallets)
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
      -- monthly_spent now covers the whole identity group, not just this wallet.
      RETURN jsonb_build_object(
        'error',         'limit_exceeded',
        'monthly_spent', v_monthly_spent,
        'this_tx_usd',   v_this_tx_usd,
        'monthly_limit', p_monthly_limit
      );
    END IF;
  END IF;

  IF COALESCE(p_dry_run, FALSE) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Only aggregation and locking widen; the row is still written for the caller.
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
