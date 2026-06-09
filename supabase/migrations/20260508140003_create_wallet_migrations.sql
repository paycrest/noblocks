-- Create wallets table to track wallet migrations and status
create table if not exists public.wallets (
  id uuid default gen_random_uuid() primary key,
  address text not null check (address ~* '^0x[0-9a-f]{40}$'),
  user_id text not null,
  wallet_type text not null check (wallet_type in ('smart_contract', 'eoa')),
  status text not null check (status in ('active', 'deprecated')),
  deprecated_at timestamptz,
  migration_completed boolean not null default false,
  migration_tx_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint: one wallet address per user
create unique index if not exists idx_wallets_user_address 
  on public.wallets(user_id, address);

-- Indexes for efficient lookups
create index if not exists idx_wallets_user_id 
  on public.wallets(user_id);

create index if not exists idx_wallets_address 
  on public.wallets(address);

create index if not exists idx_wallets_wallet_type 
  on public.wallets(wallet_type);

create index if not exists idx_wallets_status 
  on public.wallets(status);

create index if not exists idx_wallets_migration_completed 
  on public.wallets(migration_completed);

-- Function to auto-update updated_at timestamp
create or replace function public.update_wallets_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger to automatically update updated_at
drop trigger if exists wallets_update_updated_at on public.wallets;
create trigger wallets_update_updated_at
before update on public.wallets
for each row execute function public.update_wallets_updated_at();

-- Enable Row Level Security (RLS)
alter table public.wallets enable row level security;

-- RLS Policy: Users can read their own wallets
create policy "Users can read their own wallets"
on public.wallets for select
to authenticated
using (
  user_id = current_setting('request.jwt.claims', true)::json->>'sub'
);

-- RLS Policy: Service role can do everything (for admin operations)
create policy "Service role can manage all wallets"
on public.wallets for all
to service_role
using (true)
with check (true);
