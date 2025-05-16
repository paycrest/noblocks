-- Drop existing table if needed (optional)
-- DROP TABLE IF EXISTS transactions;
 -- Create the transactions table with proper JSON support for recipient

CREATE TABLE transactions ( id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
                                                                      wallet_address TEXT NOT NULL,
                                                                                          transaction_type TEXT NOT NULL CHECK (transaction_type IN ('swap',
                                                                                                                                                     'transfer')), from_currency TEXT NOT NULL,
                                                                                                                                                                                      to_currency TEXT NOT NULL,
                                                                                                                                                                                                       amount_sent NUMERIC NOT NULL,
                                                                                                                                                                                                                           amount_received NUMERIC NOT NULL,
                                                                                                                                                                                                                                                   fee NUMERIC NOT NULL,
                                                                                                                                                                                                                                                               recipient JSONB NOT NULL, -- Changed to JSONB to store structured recipient data
 status TEXT NOT NULL CHECK (status IN ('pending',
                                        'completed',
                                        'failed')), tx_hash TEXT, time_spent TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
                                                                                                                                                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL);

-- Create indices

CREATE INDEX idx_transactions_wallet_address ON transactions(wallet_address);


CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- Enable RLS

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create function to set wallet address

CREATE OR REPLACE FUNCTION set_current_wallet_address(wallet_address TEXT) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_wallet_address', wallet_address, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION set_current_wallet_address(TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION set_current_wallet_address(TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION set_current_wallet_address(TEXT) TO anon;

-- RLS policies

CREATE POLICY "Users can read own transactions" ON transactions
FOR
SELECT USING (wallet_address = current_setting('app.current_wallet_address', TRUE));


CREATE POLICY "Users can insert own transactions" ON transactions
FOR
INSERT WITH CHECK (wallet_address = current_setting('app.current_wallet_address', TRUE));


CREATE POLICY "Users can update own transactions" ON transactions
FOR
UPDATE USING (wallet_address = current_setting('app.current_wallet_address', TRUE));
