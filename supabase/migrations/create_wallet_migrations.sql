-- Create table to track wallet migrations from old SCW to EIP-7702 EOA
create table if not exists public.wallet_migrations (
  id uuid default gen_random_uuid() primary key,
  privy_user_id text not null,
  old_scw_address text not null check (old_scw_address ~* '^0x[0-9a-f]{40}$'),
  new_eoa_address text check (new_eoa_address ~* '^0x[0-9a-f]{40}$'),
  status text not null check (status in ('pending', 'in_progress', 'completed', 'failed')),
  migration_tx_hash text,
  total_balance_usd numeric(20, 8),
  migrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deprecated boolean not null default false
);

-- Unique constraint to prevent duplicate migrations per user
alter table public.wallet_migrations 
add constraint unique_user_migration 
unique (privy_user_id);

-- Indexes for efficient lookups
create index if not exists idx_wallet_migrations_user_id 
  on public.wallet_migrations(privy_user_id);

create index if not exists idx_wallet_migrations_old_scw 
  on public.wallet_migrations(old_scw_address);

create index if not exists idx_wallet_migrations_status 
  on public.wallet_migrations(status);

create index if not exists idx_wallet_migrations_created_at 
  on public.wallet_migrations(created_at desc);

-- Function to auto-update updated_at timestamp
create or replace function public.update_wallet_migrations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger to automatically update updated_at
create trigger wallet_migrations_update_updated_at
before update on public.wallet_migrations
for each row execute function public.update_wallet_migrations_updated_at();

-- Enable Row Level Security (RLS)
alter table public.wallet_migrations enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Service role can manage migrations" on public.wallet_migrations;
drop policy if exists "Users can read their own migrations" on public.wallet_migrations;

-- Service role can do everything (for API operations)
create policy "Service role can manage migrations"
on public.wallet_migrations for all
to service_role
using (true)
with check (true);

-- Users can read their own migration status (if needed for future client-side queries)
-- Note: This verifies that privy_user_id matches the JWT sub claim
create policy "Users can read their own migrations"
on public.wallet_migrations for select
to authenticated
using (
  privy_user_id = current_setting('request.jwt.claims', true)::json->>'sub'
);

