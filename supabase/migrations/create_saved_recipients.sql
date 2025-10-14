-- Create table to store saved recipients for cross-device sync
create table if not exists public.saved_recipients (
  id uuid default gen_random_uuid() primary key,
  wallet_address text not null,
  normalized_wallet_address text not null check (normalized_wallet_address ~* '^0x[0-9a-f]{40}$'),
  name text not null,
  institution text not null,
  institution_code text not null,
  account_identifier text not null,
  type text not null check (type in ('bank', 'mobile_money')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique constraint to prevent duplicate recipients per wallet
alter table public.saved_recipients 
add constraint unique_wallet_recipient 
unique (normalized_wallet_address, institution_code, account_identifier);

-- Indices for performance
create index if not exists idx_saved_recipients_wallet_address 
  on public.saved_recipients(normalized_wallet_address);

create index if not exists idx_saved_recipients_created_at 
  on public.saved_recipients(created_at desc);

-- Function to auto-populate normalized_wallet_address from wallet_address
create or replace function public.normalize_wallet_address_recipients()
returns trigger language plpgsql as $$
begin
  new.normalized_wallet_address := lower(new.wallet_address);
  return new;
end;
$$;

-- Trigger to automatically normalize wallet address on insert/update
create trigger saved_recipients_normalize_address
before insert or update on public.saved_recipients
for each row execute function public.normalize_wallet_address_recipients();

-- Function to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger to automatically update updated_at
create trigger saved_recipients_update_updated_at
before update on public.saved_recipients
for each row execute function public.update_updated_at_column();

-- Enable Row Level Security (RLS)
alter table public.saved_recipients enable row level security;

-- Drop existing policies if they exist
drop policy if exists "Service role can insert recipients" on public.saved_recipients;
drop policy if exists "Service role can update recipients" on public.saved_recipients;
drop policy if exists "Service role can read recipients" on public.saved_recipients;
drop policy if exists "Service role can delete recipients" on public.saved_recipients;

-- Restrict all operations to service role only
-- The API uses supabaseAdmin (service role key) for all database operations
create policy "Service role can insert recipients"
on public.saved_recipients for insert
to service_role
with check (true);

create policy "Service role can update recipients"
on public.saved_recipients for update
to service_role
using (true)
with check (true);

create policy "Service role can read recipients"
on public.saved_recipients for select
to service_role
using (true);

create policy "Service role can delete recipients"
on public.saved_recipients for delete
to service_role
using (true);
