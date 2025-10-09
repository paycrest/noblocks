-- Create table to track BlockFest cashback participants
create table if not exists public.blockfest_participants (
  wallet_address text primary key,
  email text,
  source text,
  created_at timestamptz not null default now()
);

-- Helpful index (redundant with PK, but keeps pattern consistent if PK changes)
create index if not exists idx_blockfest_participants_wallet
  on public.blockfest_participants (wallet_address);

-- Basic RLS setup (optional; keep open for admin-only service role writes)
alter table public.blockfest_participants enable row level security;

-- Allow service-role key to perform all actions; client should not access directly
-- (In Supabase, service role bypasses RLS; no client policy is added here.)
