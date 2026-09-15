-- Activepieces: pending onramps awaiting pay-in email.
-- Standalone CONCURRENTLY migration — do NOT wrap in BEGIN/COMMIT or add
-- other statements. If interrupted and left INVALID:
--   DROP INDEX IF EXISTS idx_transactions_payin_email_pending;

create index concurrently if not exists idx_transactions_payin_email_pending
  on public.transactions (created_at desc)
  where transaction_type = 'onramp'
    and status = 'pending'
    and payin_email_sent_at is null
    and email is not null;
