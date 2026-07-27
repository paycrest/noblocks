-- Partial index supporting the onramp half of the reconcile-pending-orders cron
-- (companion to 20260723120001_create_offramp_pending_reconcile_index.sql, which
-- covers offramp).
--
-- WHY: the reconciler now scans onramp rows too. An onramp row only leaves
-- `pending` via the client-side poll, so a closed tab strands it even though the
-- crypto was delivered — the same failure the offramp scan was built for. Onramp
-- lookups go to /v2/sender/orders/{uuid} with the sender API key; only `settled`
-- completes an onramp (`validated` stays pending), and unfunded orders drop out
-- once their validUntil window closes and they map to `expired`.
--
-- This index matches the reconciler's onramp scan predicate exactly and INCLUDEs
-- the columns it projects, so each run scans just the still-pending onramp rows
-- (keyset-ordered by created_at) and can be served index-only when visibility-map
-- conditions permit. `network` is included to keep the projection identical to the
-- offramp scan even though onramp lookups are chain-agnostic. Rows advanced to a
-- terminal status leave this partial index automatically, keeping it tiny.
--
-- NEW EDGE FUNCTION SECRET (set out-of-band, alongside AGGREGATOR_URL and
-- RECONCILE_CRON_SECRET from 20260723120000):
--   AGGREGATOR_SENDER_API_KEY_ID = <same sender API key the app uses>
-- Without it the function still runs and reconciles offramp; the onramp scan is
-- skipped and reported as onrampSkippedReason in the run summary.
--
-- Built CONCURRENTLY so creating it does not lock writes on the (populated)
-- transactions table. CREATE INDEX CONCURRENTLY cannot run inside a transaction
-- block, which is why this migration contains only this statement — do NOT add
-- other statements or wrap it in BEGIN/COMMIT.
--
-- Operational note: if a CONCURRENTLY build is interrupted it can leave an INVALID
-- index of this name behind (IF NOT EXISTS will then skip a re-create). If that
-- happens, drop it and re-run:
--   DROP INDEX IF EXISTS idx_transactions_onramp_pending_reconcile;

create index concurrently if not exists idx_transactions_onramp_pending_reconcile
  on transactions (created_at)
  include (id, order_id, network, status)
  where transaction_type = 'onramp'
    and order_id is not null
    and status in ('pending', 'fulfilling', 'fulfilled', 'refunding');
