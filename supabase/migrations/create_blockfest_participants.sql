-- Create table to track BlockFest cashback participants
create table if not exists public.blockfest_participants (
  wallet_address text primary key,
  email text,
  source text,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table public.blockfest_participants enable row level security;

-- Allow all insert/update operations (API is rate-limited and validates input)
create policy "Allow inserts for blockfest participants"
on public.blockfest_participants for insert
with check (true);

create policy "Allow updates for blockfest participants"
on public.blockfest_participants for update
using (true)
with check (true);

-- Allow reads (needed for checking claim status)
create policy "Allow reads for blockfest participants"
on public.blockfest_participants for select
using (true);
