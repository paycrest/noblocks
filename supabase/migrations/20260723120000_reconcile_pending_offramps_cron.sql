-- Schedule the reconcile-pending-orders Edge Function via pg_cron.
--
-- WHY: offramp orders are created on-chain (no Paycrest sender API key / webhook),
-- so a row only moves pending -> completed via the client-side poll in
-- app/pages/TransactionStatus.tsx. If the user closes the tab before the aggregator
-- settles, the row is stuck at `pending` even though the payout happened, which
-- blocks referral-campaign activation. This cron re-reads aggregator status
-- server-side every 2 minutes and persists the terminal status.
--
-- PREREQUISITES (created out-of-band, NOT in this migration):
--   1. Edge Function `reconcile-pending-orders` deployed (verify_jwt = false).
--   2. Edge Function secrets set: AGGREGATOR_URL, RECONCILE_CRON_SECRET.
--   3. Two Vault secrets in this database so the URL/secret are not hardcoded here:
--        - `edge_reconcile_url`     = https://<project-ref>.supabase.co/functions/v1/reconcile-pending-orders
--        - `reconcile_cron_secret`  = <same value as the RECONCILE_CRON_SECRET function secret>
--      e.g.  select vault.create_secret('https://<ref>.supabase.co/functions/v1/reconcile-pending-orders', 'edge_reconcile_url');
--            select vault.create_secret('<secret>', 'reconcile_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Efficiency: partial index matching the reconciler's scan predicate exactly, so
-- each 2-minute run does an index-only range scan over just the still-pending
-- offramp rows (keyset-ordered by created_at) instead of scanning the whole
-- transactions table. Rows advanced to a terminal status leave this index
-- automatically, keeping it tiny in steady state.
create index if not exists idx_transactions_offramp_pending_reconcile
  on transactions (created_at)
  where transaction_type = 'offramp'
    and order_id is not null
    and status in ('pending', 'fulfilling', 'fulfilled', 'refunding');

-- Idempotent (re)schedule: drop any prior job with this name first.
do $$
begin
  perform cron.unschedule('reconcile-pending-offramps');
exception
  when others then null; -- job did not exist yet
end $$;

select cron.schedule(
  'reconcile-pending-offramps',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_reconcile_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-reconcile-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reconcile_cron_secret')
    ),
    body := '{}'::jsonb,
    -- Above the Edge Function's per-run wall-clock budget (MAX_RUN_MS = 90s) plus
    -- the worst-case overrun of one in-flight batch, with margin. Keeping this
    -- below the pg_net default lets the cron see the function's real result
    -- instead of recording a spurious timeout on longer reconciliation runs.
    timeout_milliseconds := 150000
  );
  $$
);
