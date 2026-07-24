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

-- The supporting partial index that lets each run scan just the still-pending
-- offramp rows — served index-only when visibility-map conditions permit — is
-- created in the companion migration
-- 20260723120001_create_offramp_pending_reconcile_index.sql. It is built with
-- CREATE INDEX CONCURRENTLY, which cannot share a transaction with other
-- statements, so it must live in its own migration.

-- cron.schedule upserts by job name: re-running this migration updates the existing
-- 'reconcile-pending-offramps' job in place rather than creating a duplicate.
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
    -- net.http_post is asynchronous: it queues the request and returns
    -- immediately, and the background worker records the eventual response (or a
    -- timeout) in net._http_response. timeout_milliseconds bounds that background
    -- request. 150000 (150s) exceeds the pg_net default (5s) and clears the Edge
    -- Function's per-run wall-clock budget (MAX_RUN_MS = 90s) plus one in-flight
    -- batch of overrun, so a longer reconciliation run completes and is recorded
    -- rather than being cut off as a timeout.
    timeout_milliseconds := 150000
  );
  $$
);
