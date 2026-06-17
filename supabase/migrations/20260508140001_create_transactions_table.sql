-- Drop existing table if needed (optional)
-- DROP TABLE IF EXISTS transactions;

-- Create the transactions table with proper JSON support for recipient
CREATE TABLE transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (
        transaction_type IN ('onramp', 'offramp', 'transfer')
    ),
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    amount_sent NUMERIC NOT NULL,
    amount_received NUMERIC NOT NULL,
    fee NUMERIC NOT NULL,
    recipient JSONB NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN (
            'pending',
            'fulfilling',
            'completed',
            'failed'
        )
    ),
    tx_hash TEXT,
    time_spent TEXT,
    email TEXT,
    network TEXT,
    order_id TEXT,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    explorer_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indices
CREATE INDEX idx_transactions_wallet_address ON transactions (wallet_address);
CREATE INDEX idx_transactions_created_at ON transactions (created_at DESC);
-- Plain UNIQUE (order_id, tx_hash) allows duplicate rows when either is NULL.
CREATE UNIQUE INDEX idx_transactions_order_id_unique
  ON transactions (order_id)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX idx_transactions_order_txhash_unique
  ON transactions (order_id, tx_hash)
  WHERE order_id IS NOT NULL AND tx_hash IS NOT NULL;

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create function to set wallet address
CREATE OR REPLACE FUNCTION set_current_wallet_address(wallet_address TEXT) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_wallet_address', wallet_address, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions — only service_role (backend) may set the wallet address.
-- Granting this to anon/authenticated would allow clients to impersonate any
-- wallet and bypass the RLS policies that rely on current_setting().
GRANT EXECUTE ON FUNCTION set_current_wallet_address(TEXT) TO service_role;

-- RLS policies
CREATE POLICY "Users can read own transactions" ON transactions
    FOR SELECT USING (
        wallet_address = current_setting('app.current_wallet_address', TRUE)
    );

CREATE POLICY "Users can insert own transactions" ON transactions
    FOR INSERT WITH CHECK (
        wallet_address = current_setting('app.current_wallet_address', TRUE)
    );

CREATE POLICY "Users can update own transactions" ON transactions
    FOR UPDATE USING (
        wallet_address = current_setting('app.current_wallet_address', TRUE)
    );