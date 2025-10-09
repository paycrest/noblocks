-- Create table to track BlockFest cashback participants
create table if not exists public.blockfest_participants (
  wallet_address text primary key,
  email text,
  source text,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table public.blockfest_participants enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Allow inserts for blockfest participants" on public.blockfest_participants;
drop policy if exists "Allow updates for blockfest participants" on public.blockfest_participants;
drop policy if exists "Allow reads for blockfest participants" on public.blockfest_participants;

-- Restrict all operations to service role only
-- The API uses supabaseAdmin (service role key) for all database operations
create policy "Service role can insert participants"
on public.blockfest_participants for insert
to service_role
with check (true);

create policy "Service role can update participants"
on public.blockfest_participants for update
to service_role
using (true)
with check (true);

create policy "Service role can read participants"
on public.blockfest_participants for select
to service_role
using (true);
