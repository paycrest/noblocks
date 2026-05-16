-- Allow onramp rows in transaction history (fiat → crypto via payment order).
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

ALTER TABLE transactions
ADD CONSTRAINT transactions_transaction_type_check CHECK (
    transaction_type IN ('onramp', 'offramp', 'transfer')
);
