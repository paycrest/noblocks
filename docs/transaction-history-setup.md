# Transaction History Setup Guide

This guide explains how to set up the environment variables and database (Supabase) for transaction history, including related security policies and Privy integration.

## Getting Your Supabase Environment Variables

To connect your app to Supabase, you'll need your project's API keys and URL. Here's how to find them:

1. Go to your Supabase project dashboard.
2. In the left sidebar, click on **Settings**.
3. Under Settings, select the **Data API** tab.
4. Here, you'll find your Project URL and API keys (anon/public and service_role).

![Supabase Data API Settings](https://i.ibb.co/1J7CdS3h/image.png)

**Required Supabase environment variables:**

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Copy these values and add them to your `.env.local` file as needed for your project.

## Getting Your Privy Environment Variables

To connect your app to Privy, you'll need your app's secret, JWKS URL, and issuer. Here's how to find them:

1. Go to your Privy dashboard.
2. In the sidebar, click on **Configuration**.
3. Then select **App Settings**.
4. Here, you'll find your App Secret and JWKS URL.

![Privy App Settings](https://i.ibb.co/YBBwNVDb/image.png)

**Required Privy environment variables:**

```env
PRIVY_APP_SECRET=
PRIVY_JWKS_URL=
PRIVY_ISSUER=privy.io
```

Copy these values and add them to your `.env.local` file as needed for your project.

## Table Setup

1. Go to your Supabase project dashboard
2. Navigate to "SQL Editor"
3. Create a new query and paste the following SQL:

```sql
-- Drop existing table if it exists
DROP TABLE IF EXISTS public.transactions;

-- Create transactions table
CREATE TABLE public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id TEXT NOT NULL,
    wallet_address TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    amount_sent DECIMAL NOT NULL,
    amount_received DECIMAL NOT NULL,
    fee DECIMAL NOT NULL,
    recipient JSONB NOT NULL,
    status TEXT NOT NULL,
    time_spent TEXT,
    tx_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own transactions"
ON public.transactions
FOR SELECT
USING (wallet_address = current_setting('app.current_wallet_address', true));

CREATE POLICY "Users can insert their own transactions"
ON public.transactions
FOR INSERT
WITH CHECK (wallet_address = current_setting('app.current_wallet_address', true));

-- Create function for setting current wallet address
CREATE OR REPLACE FUNCTION public.set_current_wallet_address(wallet_address TEXT)
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_wallet_address', wallet_address, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

4. Click "Run" to execute the SQL

## Verify Setup

To verify the setup was successful, you can run these queries:

1. Check table structure:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions'
AND table_schema = 'public'
ORDER BY ordinal_position;
```

2. Check policies:

```sql
SELECT * FROM pg_policies WHERE tablename = 'transactions';
```

3. Test the function:

```sql
SELECT set_current_wallet_address('0x123...');
```

## Troubleshooting

If you encounter any errors:

1. Make sure you're connected to the correct database
2. Verify that the table was created successfully
3. Check that RLS is enabled on the table
4. Ensure the policies were created correctly
5. Verify the function exists and works

## Notes

- The table uses Row Level Security (RLS) to ensure users can only access their own transactions
- The `set_current_wallet_address` function is used by the middleware to set the current user's wallet address
- All timestamps are in UTC (TIMESTAMPTZ)
- The `recipient` field is stored as JSONB to allow flexible recipient data structure
