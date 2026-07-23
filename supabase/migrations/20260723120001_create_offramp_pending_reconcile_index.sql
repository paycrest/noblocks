-- Partial index supporting the reconcile-pending-orders cron (companion to
-- 20260723120000_reconcile_pending_offramps_cron.sql).
--
-- It matches the reconciler's scan predicate exactly, so each 2-minute run does an
-- index-only range scan over just the still-pending offramp rows (keyset-ordered
-- by created_at) instead of scanning the whole transactions table. Rows advanced
-- to a terminal status leave this partial index automatically, keeping it tiny in
-- steady state.
--
-- Built CONCURRENTLY so creating it does not lock writes on the (populated)
-- transactions table. CREATE INDEX CONCURRENTLY cannot run inside a transaction
-- block, which is why this is a standalone migration containing only this
-- statement — do NOT add other statements or wrap it in BEGIN/COMMIT.
--
-- Operational note: if a CONCURRENTLY build is interrupted it can leave an INVALID
-- index of this name behind (IF NOT EXISTS will then skip a re-create). If that
-- happens, drop it and re-run:
--   DROP INDEX IF EXISTS idx_transactions_offramp_pending_reconcile;

create index concurrently if not exists idx_transactions_offramp_pending_reconcile
  on transactions (created_at)
  where transaction_type = 'offramp'
    and order_id is not null
    and status in ('pending', 'fulfilling', 'fulfilled', 'refunding');
