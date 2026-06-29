-- Allow 'credit' (and legacy 'swap') as valid transaction_type values.
-- Main uses onramp / offramp / transfer; Moralis deposits use credit.

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_transaction_type_check
  CHECK (transaction_type IN ('onramp', 'offramp', 'transfer', 'swap', 'credit'));
