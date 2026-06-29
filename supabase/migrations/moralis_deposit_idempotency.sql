-- One row per (chain, transfer) for Moralis deposit → Activepieces / Brevo deduplication.
-- Run in Supabase SQL editor before idempotency is effective.

create table if not exists moralis_deposit_idempotency (
  idempotency_key text primary key,
  created_at timestamptz not null default now()
);

create index if not exists moralis_deposit_idempotency_created_at
  on moralis_deposit_idempotency (created_at);

comment on table moralis_deposit_idempotency is
  'Deduplication keys for Moralis stream deposit notifications; prevents duplicate emails on webhook redelivery.';
