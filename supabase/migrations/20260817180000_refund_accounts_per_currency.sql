-- Scope refund accounts per wallet + fiat currency (onramp).
--
-- Idempotent: #667 landed on stable and its DDL was applied to production
-- outside the main migrate ledger. After retimestamping to 20260817180000,
-- db push re-runs this file; column/constraint may already exist.

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

-- Unique (wallet, currency) also provides the lookup index; no separate btree needed.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.refund_accounts'::regclass
       and conname  = 'refund_accounts_one_per_wallet_currency'
  ) then
    alter table public.refund_accounts
      add constraint refund_accounts_one_per_wallet_currency
      unique (normalized_wallet_address, currency);
  end if;
end
$$;
