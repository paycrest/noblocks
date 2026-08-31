-- Restore 'bridge' omitted when 'credit' was added (20260727130000).

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_transaction_type_check
  CHECK (transaction_type IN ('onramp', 'offramp', 'transfer', 'bridge', 'swap', 'credit'));
