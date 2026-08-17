-- Release cashback quota stranded by a killed invocation.
--
-- WHY: 20260817180200 pools the BlockFest caps per verified identity and counts
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
-- SCOPE — why a null tx_hash is not sufficient on its own:
-- `tx_hash` is only persisted *after* writeContract returns, so a row can have a
-- null hash and still have had its transfer broadcast. Reaping on a null hash
-- alone would release quota for a claim that was actually paid, letting the
-- identity claim beyond its cap. `transfer_attempted_at` closes that: the route
-- stamps it immediately BEFORE broadcasting, and aborts the claim if the stamp
-- cannot be persisted. So:
--
--   transfer_attempted_at IS NULL  → provably never broadcast → safe to release
--   stamped, tx_hash IS NULL       → may or may not have been paid → left alone
--                                    for manual reconciliation (the route logs
--                                    "MANUAL REVIEW NEEDED" for this case)
--   tx_hash present                → paid, not stranded
--
-- Deliberately conservative: a stamped-but-hashless row keeps consuming its
-- reservation until a human resolves it. Wrongly releasing quota for a real
-- payout is worse than holding a slot for an outage that already needs review.
--
-- The rows are marked 'failed' rather than deleted: they record a claim attempt,
-- and 'failed' is the status the quota function already treats as released.

create extension if not exists pg_cron;

-- Set immediately before the on-chain broadcast; see app/api/blockfest/cashback/route.ts.
alter table public.blockfest_cashback_claims
  add column if not exists transfer_attempted_at timestamptz;

comment on column public.blockfest_cashback_claims.transfer_attempted_at is
  'Stamped immediately before the cashback transfer is broadcast. NULL proves no '
  'broadcast was attempted, which is what makes a stranded pending row safe to '
  'reap. Never cleared.';

-- Rows that predate the column have transfer_attempted_at NULL, but for them
-- NULL means "unknown", not "never broadcast" — the marker did not exist when
-- they ran, and some may be transfers that succeeded before tx_hash was
-- persisted. Leaving them NULL would hand exactly those to the sweep below.
-- Stamp them so they are excluded and can only be cleared by a human.
--
-- Stamped with created_at rather than now(): the column records when a broadcast
-- was attempted, and claiming it happened at migration time would be false. For
-- these rows it means "attempted at some unknown point at or after this".
update public.blockfest_cashback_claims
   set transfer_attempted_at = created_at
 where status = 'pending'
   and transfer_attempted_at is null;

-- Supports the sweep's predicate; the partial WHERE keeps it to the handful of
-- rows that are actually in flight at any moment.
create index if not exists idx_cashback_claims_pending_reap
  on public.blockfest_cashback_claims (created_at)
  where status = 'pending' and tx_hash is null and transfer_attempted_at is null;

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
     and transfer_attempted_at is null
     and created_at < now() - interval '30 minutes';
  $$
);
