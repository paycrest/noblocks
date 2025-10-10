-- Create table to track BlockFest cashback claims
create table if not exists public.blockfest_cashback_claims (
  id uuid primary key default gen_random_uuid(),
  transaction_id text unique not null,
  wallet_address text not null,
  amount text not null,
  token_type text not null,
  tx_hash text,
  status text not null, -- 'pending', 'completed', 'failed'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for efficient queries
create index idx_cashback_claims_transaction on blockfest_cashback_claims(transaction_id);
create index idx_cashback_claims_wallet on blockfest_cashback_claims(wallet_address);
create index idx_cashback_claims_status on blockfest_cashback_claims(status);

-- Enable Row Level Security (RLS)
alter table public.blockfest_cashback_claims enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Allow inserts for cashback claims" on public.blockfest_cashback_claims;
drop policy if exists "Allow updates for cashback claims" on public.blockfest_cashback_claims;
drop policy if exists "Allow reads for cashback claims" on public.blockfest_cashback_claims;

-- Restrict all operations to service role only
-- The API uses supabaseAdmin (service role key) for all database operations
create policy "Service role can insert claims"
on public.blockfest_cashback_claims for insert
to service_role
with check (true);

create policy "Service role can update claims"
on public.blockfest_cashback_claims for update
to service_role
using (true)
with check (true);

create policy "Service role can read claims"
on public.blockfest_cashback_claims for select
to service_role
using (true);
