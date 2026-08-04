-- Release cashback quota stranded by a killed invocation.
--
-- WHY: 20260804120000 pools the BlockFest caps per verified identity and counts
-- 'pending' rows against them — that reservation is what stops two sibling
-- wallets racing past the shared $500 / 10-claim limit. The reservation is
-- released when the route's transfer catch block sets 'failed'.
--
-- But that catch block only runs if the invocation survives. If it is killed
-- between the quota insert and the transfer completing — serverless timeout,
-- OOM, an instance rolled by a deploy — the row stays 'pending' forever. It
-- permanently consumes one of the identity's 10 pooled slots and its share of
-- the $500, across every wallet sharing that identity, and because Step 8
-- returns any existing row for the transaction_id the user cannot retry it
-- either. Nothing else reclaims these.
--
-- SCOPE: `tx_hash IS NULL` only. A row that recorded a hash reached the transfer
-- and is not stranded. The residual risk is the narrow window where the transfer
-- was broadcast but the status update had not yet persisted the hash — the route
-- already logs that case as "MANUAL REVIEW NEEDED", and it is milliseconds wide
-- against a 30-minute threshold. Freeing quota there slightly over-credits an
-- identity; the alternative (never reclaiming) permanently under-credits one for
-- an outage that was not the user's doing, which is the worse failure.
--
-- The rows are marked 'failed' rather than deleted: they record a claim attempt,
-- and 'failed' is the status the quota function already treats as released.

create extension if not exists pg_cron;

-- Supports the sweep's predicate; the partial WHERE keeps it to the handful of
-- rows that are actually in flight at any moment.
create index if not exists idx_cashback_claims_pending_reap
  on public.blockfest_cashback_claims (created_at)
  where status = 'pending' and tx_hash is null;

-- cron.schedule upserts by job name: re-running this migration updates the
-- existing job in place rather than creating a duplicate.
select cron.schedule(
  'reap-stale-pending-cashback-claims',
  '*/10 * * * *',
  $$
  update public.blockfest_cashback_claims
     set status     = 'failed',
         updated_at = now()
   where status     = 'pending'
     and tx_hash is null
     and created_at < now() - interval '30 minutes';
  $$
);
