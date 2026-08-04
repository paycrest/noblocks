-- Atomic identity-scoped cashback quota reservation.
--
-- The BlockFest cashback caps (claim count and total USD) are pooled across all
-- smart wallets sharing a verified identity, but validating the quota with plain
-- reads followed by a separate insert lets two concurrent sibling-wallet claims
-- each pass the check and together exceed the shared cap. Same shape of fix as
-- 20260726120000 (insert_swap_transaction_if_within_limit): check + insert in one
-- function, serialized by advisory locks on the identity keys.
--
-- Quota semantics:
--   * 'completed' and 'pending' rows consume the allowance. Counting 'pending'
--     is what closes the concurrency window — an in-flight claim reserves its
--     amount the moment its row is inserted, before the transfer settles.
--   * 'failed' rows do not consume it: a failed transfer releases its
--     reservation, so transient transfer errors never permanently short-change
--     the identity. (Re-submitting the same transaction still surfaces the
--     stored failed claim via the route's transaction_id idempotency check.)
--
-- Return contract (JSONB) — app/api/blockfest/cashback/route.ts depends on this:
--   success:   { "id": <uuid>, "adjusted_amount": <text, 2 decimals> }
--   quota:     { "error": "max_claims_reached",   "claim_count": <int>,  "max_claims": <int> }
--              { "error": "max_cashback_reached", "total_claimed": <number>, "max_cashback": <number> }
--   too small: { "error": "amount_too_small" }  -- the claim rounds to $0.00; inserting
--                it would burn a claim slot on a zero transfer.
--   duplicate: { "error": "duplicate_transaction" }  -- unique violation on transaction_id,
--                two concurrent submissions of the same transaction raced past the
--                route's idempotency lookup; the loser lands here.

CREATE OR REPLACE FUNCTION public.insert_cashback_claim_if_within_quota(
  p_transaction_id TEXT,
  p_wallet_address TEXT,
  p_amount         NUMERIC,
  p_token_type     TEXT,
  p_max_claims     INTEGER,
  p_max_total_usd  NUMERIC,
  -- Smart wallets sharing the caller's verified identity. NULL → just the caller.
  p_scope_wallets  TEXT[] DEFAULT NULL,
  -- Advisory-lock keys for that identity. NULL → the caller's own wallet key.
  p_identity_keys  TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned as a function attribute (not body-level set_config) so pg_temp is
-- excluded too: a caller-created temp table could otherwise shadow
-- blockfest_cashback_claims in the unqualified references below.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope_wallets TEXT[];
  v_sorted_keys   TEXT[];
  v_key           TEXT;
  v_claim_count   INTEGER := 0;
  v_total_claimed NUMERIC := 0;
  v_adjusted      NUMERIC;
  v_new_id        UUID;
BEGIN
  -- Defense in depth against a malformed amount. Postgres sorts NaN above every
  -- numeric, so without this LEAST(NaN, remaining) below would resolve to the
  -- identity's entire remaining allowance. (p_amount <> p_amount is the NaN test.)
  IF p_amount IS NULL OR p_amount <> p_amount OR p_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'amount_too_small');
  END IF;

  -- Always include the caller, and dedupe: a stale or partial scope must never
  -- leave the caller with a narrower pool than its own wallet.
  SELECT COALESCE(array_agg(DISTINCT w), ARRAY[p_wallet_address])
    INTO v_scope_wallets
    FROM unnest(
           COALESCE(p_scope_wallets, ARRAY[]::TEXT[]) || ARRAY[p_wallet_address]
         ) AS w;

  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY['wallet:' || p_wallet_address])
    INTO v_sorted_keys
    FROM unnest(COALESCE(p_identity_keys, ARRAY[]::TEXT[])) AS k;

  -- Lock the identity, not the wallet: sibling wallets sharing a pool must
  -- serialize against each other. Keys are taken in sorted order so a
  -- transaction holding the phone key and one holding the ID key cannot deadlock.
  FOREACH v_key IN ARRAY v_sorted_keys LOOP
    PERFORM pg_advisory_xact_lock(hashtext(v_key));
  END LOOP;

  SELECT COUNT(*), COALESCE(SUM(amount::NUMERIC), 0)
    INTO v_claim_count, v_total_claimed
    FROM blockfest_cashback_claims
   WHERE wallet_address = ANY (v_scope_wallets)
     AND status IN ('pending', 'completed');

  IF v_claim_count >= p_max_claims THEN
    RETURN jsonb_build_object(
      'error',       'max_claims_reached',
      'claim_count', v_claim_count,
      'max_claims',  p_max_claims
    );
  END IF;

  IF v_total_claimed >= p_max_total_usd THEN
    RETURN jsonb_build_object(
      'error',         'max_cashback_reached',
      'total_claimed', v_total_claimed,
      'max_cashback',  p_max_total_usd
    );
  END IF;

  -- Trim the claim to whatever allowance the identity has left.
  v_adjusted := round(LEAST(p_amount, p_max_total_usd - v_total_claimed), 2);

  -- 1% of a sub-$0.50 transaction rounds to 0.00 — inserting that would burn
  -- one of the pooled claim slots on a zero transfer.
  IF v_adjusted <= 0 THEN
    RETURN jsonb_build_object('error', 'amount_too_small');
  END IF;

  BEGIN
    INSERT INTO blockfest_cashback_claims (
      transaction_id, wallet_address, amount, token_type, status
    ) VALUES (
      p_transaction_id, p_wallet_address, v_adjusted::TEXT, p_token_type, 'pending'
    )
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'duplicate_transaction');
  END;

  RETURN jsonb_build_object(
    'id',              v_new_id,
    'adjusted_amount', v_adjusted::TEXT
  );
END;
$$;

-- SECURITY DEFINER functions are EXECUTE-able by PUBLIC by default, which would
-- expose this through PostgREST to anon/authenticated with caller-chosen quota
-- limits. Only the service role (used by supabaseAdmin) may call it.
REVOKE ALL ON FUNCTION public.insert_cashback_claim_if_within_quota FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_cashback_claim_if_within_quota TO service_role;
