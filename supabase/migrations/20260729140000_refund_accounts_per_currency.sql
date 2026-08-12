-- Scope refund accounts per wallet + fiat currency (onramp).

alter table public.refund_accounts
  add column if not exists currency text;

update public.refund_accounts
set currency = 'NGN'
where currency is null;

alter table public.refund_accounts
  alter column currency set default 'NGN',
  alter column currency set not null;

alter table public.refund_accounts
  drop constraint if exists refund_accounts_one_per_wallet;

alter table public.refund_accounts
  add constraint refund_accounts_one_per_wallet_currency
  unique (normalized_wallet_address, currency);

create index if not exists idx_refund_accounts_wallet_currency
  on public.refund_accounts (normalized_wallet_address, currency);
