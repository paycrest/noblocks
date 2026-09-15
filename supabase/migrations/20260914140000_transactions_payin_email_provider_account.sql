-- Pay-in confirmation emails (Activepieces):
-- 1) payin_email_sent_at — separate from email_sent_at so instructions + complete
--    can both send without blocking each other.
-- 2) provider_account — VA / bank pay-in details for onramp instruction emails.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payin_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_account JSONB;

COMMENT ON COLUMN public.transactions.payin_email_sent_at IS
  'When the onramp pay-in instructions email was sent (Activepieces).';

COMMENT ON COLUMN public.transactions.provider_account IS
  'Onramp virtual-account / bank transfer details from aggregator providerAccount.';

-- Activepieces: pending onramps awaiting pay-in email
CREATE INDEX IF NOT EXISTS idx_transactions_payin_email_pending
  ON public.transactions (created_at DESC)
  WHERE transaction_type = 'onramp'
    AND status = 'pending'
    AND payin_email_sent_at IS NULL
    AND email IS NOT NULL;

-- Activepieces: swap-complete email when DB status is completed.
-- Aggregator validated/settled are already mapped into transactions.status:
--   onramp  settled   → completed (validated/settling stay pending)
--   offramp validated → completed
CREATE INDEX IF NOT EXISTS idx_transactions_complete_email_pending
  ON public.transactions (created_at DESC)
  WHERE status = 'completed'
    AND email_sent_at IS NULL
    AND email IS NOT NULL;
