-- Pay-in confirmation emails (Activepieces):
-- 1) payin_email_sent_at — separate from email_sent_at so instructions + complete
--    can both send without blocking each other.
-- 2) provider_account — VA / bank pay-in details for onramp instruction emails.
--
-- Indexes are created in follow-up migrations with CREATE INDEX CONCURRENTLY
-- (cannot share a transaction with these ALTERs).

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payin_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_account JSONB;

COMMENT ON COLUMN public.transactions.payin_email_sent_at IS
  'When the onramp pay-in instructions email was sent (Activepieces).';

COMMENT ON COLUMN public.transactions.provider_account IS
  'Onramp virtual-account / bank transfer details from aggregator providerAccount.';
