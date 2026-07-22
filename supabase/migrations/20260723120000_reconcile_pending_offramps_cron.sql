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
    timeout_milliseconds := 30000
  );
  $$
);
