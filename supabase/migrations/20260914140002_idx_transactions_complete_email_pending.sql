-- Activepieces: completed txs awaiting swap-complete email.
-- Aggregator validated/settled map to transactions.status:
--   onramp  settled   → completed (validated/settling stay pending)
--   offramp validated → completed
-- Standalone CONCURRENTLY migration — do NOT wrap in BEGIN/COMMIT.
-- If interrupted and left INVALID:
--   DROP INDEX IF EXISTS idx_transactions_complete_email_pending;

create index concurrently if not exists idx_transactions_complete_email_pending
  on public.transactions (created_at desc)
  where status = 'completed'
    and email_sent_at is null
    and email is not null;
