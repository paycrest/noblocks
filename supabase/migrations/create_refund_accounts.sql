-- Refund payout account per connected wallet (onramp).

create extension if not exists pgcrypto;

create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.refund_accounts (
  id uuid default gen_random_uuid() primary key,
  wallet_address text not null,
  normalized_wallet_address text not null check (normalized_wallet_address ~* '^0x[0-9a-f]{40}$'),
  institution text not null,
  institution_code text not null,
  account_identifier text not null,
  account_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refund_accounts_one_per_wallet unique (normalized_wallet_address)
);

create index if not exists idx_refund_accounts_wallet
  on public.refund_accounts (normalized_wallet_address);

create or replace function public.normalize_wallet_address_refund_accounts()
returns trigger language plpgsql as $$
begin
  new.normalized_wallet_address := lower(new.wallet_address);
  return new;
end;
$$;

drop trigger if exists refund_accounts_normalize_address on public.refund_accounts;
create trigger refund_accounts_normalize_address
before insert or update on public.refund_accounts
for each row execute function public.normalize_wallet_address_refund_accounts();

drop trigger if exists refund_accounts_updated_at on public.refund_accounts;
create trigger refund_accounts_updated_at
before update on public.refund_accounts
for each row execute function public.update_updated_at_column();

alter table public.refund_accounts enable row level security;

drop policy if exists "Service role full access refund_accounts" on public.refund_accounts;
create policy "Service role full access refund_accounts"
on public.refund_accounts for all
to service_role
using (true)
with check (true);
