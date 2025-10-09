-- Create table to track BlockFest cashback participants
create table if not exists public.blockfest_participants (
  wallet_address text not null,
  normalized_address text primary key check (normalized_address ~* '^0x[0-9a-f]{40}$'),
  email text,
  source text,
  created_at timestamptz not null default now()
);

-- Index on created_at for recency queries
create index if not exists idx_blockfest_participants_created_at 
  on public.blockfest_participants(created_at desc);

-- Function to auto-populate normalized_address from wallet_address
create or replace function public.normalize_wallet_address()
returns trigger language plpgsql as $$
begin
  new.normalized_address := lower(new.wallet_address);
  return new;
end;
$$;

-- Trigger to automatically normalize wallet address on insert/update
create trigger blockfest_participants_normalize_address
before insert or update on public.blockfest_participants
for each row execute function public.normalize_wallet_address();

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
