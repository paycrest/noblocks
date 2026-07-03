-- Allow 'bridge' as a valid transaction_type value.
-- Postgres inline CHECK constraints get auto-named <table>_<column>_check;
-- drop by that name and recreate with the extended set.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_transaction_type_check
  CHECK (transaction_type IN ('onramp', 'offramp', 'transfer', 'bridge', 'swap'));

-- Extend the status CHECK to match every value in the TypeScript TransactionStatus union.
-- The original constraint only had pending/fulfilling/completed/failed; bridge introduces
-- 'refunded' (NEAR Intents / LI.FI terminal refund state).
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN (
    'pending',
    'processing',
    'fulfilling',
    'fulfilled',
    'refunding',
    'completed',
    'failed',
    'refunded',
    'expired'
  ));
