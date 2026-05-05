-- Allow 'credit' as a valid transaction_type value.
-- The original CHECK constraint only covered 'swap' and 'transfer'; subsequent
-- migrations added 'onramp' implicitly via application logic. We now add 'credit'
-- for incoming on-chain deposits surfaced through Moralis Streams.

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_transaction_type_check
  CHECK (transaction_type IN ('swap', 'transfer', 'onramp', 'credit'));
