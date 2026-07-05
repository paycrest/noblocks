# Noblocks Play — World Cup 2026 Fantasy League

Campaign feature (PRD "Noblocks World Cup Fantasy League" v1.2 / TRD v1.0):
a free fantasy league over the World Cup knockout rounds (MD6 Quarter-finals,
MD7 Semi-finals, MD8 Final + bronze) with a 300 USDC giveaway on Base for the
top 10 **qualified** managers (ranks 1–5 ×40, 6–10 ×20). Qualification =
5 activated referrals before the deadline; a referral activates when the
referred user's **cumulative** completed on/off-ramp volume reaches $5
USD-equivalent inside the campaign window (explicitly not a single-$5 rule).

Everything is isolated behind the `fantasy_` DB prefix, `/play` pages,
`/api/play/*` routes and `app/lib/fantasy/*` — droppable after the campaign.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `API_FOOTBALL_KEY` | Next.js app + seed script | API-Football (api-sports.io) key. World Cup = league 1, season 2026. Dev: free tier (100 req/day). Launch: Pro, prepaid single month. |
| `FANTASY_WORKER_SECRET` | Next.js app + CF worker secret | Auth for `POST /api/play/worker` (`x-internal-auth` header). Falls back to `INTERNAL_API_KEY` when unset. |
| `FANTASY_ADMIN_KEY` | Next.js app | Auth for `/api/play/admin/*` (`x-admin-key` header). Unset ⇒ admin tooling is off. |
| `NEXT_PUBLIC_FANTASY_ENABLED` | Next.js app | Feature flag. Explicit opt-in: must be exactly `"true"` to show `/play` UI and serve the user-facing API — unset/anything else 404s them pre-launch. Worker + admin keep working regardless. |
| `BREVO_API_KEY` (existing) | Next.js app | Transactional emails (F-14). Emails are additionally gated by `fantasy_settings.config.features.emails`. |
| `BREVO_SENDER_EMAIL` (optional) | Next.js app | Sender for fantasy emails; defaults to `no-reply@noblocks.xyz`. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (existing) | app + seed script | Service-role DB access. |

## Architecture

- **DB** — `supabase/migrations/20260704120000…` (username on `user_kyc_profiles`)
  and `…20260704120001_create_fantasy_tables.sql` (all `fantasy_*` tables,
  `fantasy_qualification` + `fantasy_leaderboard` views, RLS deny-all /
  service-role only). Rules (scoring matrix, budget 105, nation caps, free
  transfers, deadlines, flags) live in `fantasy_settings.config` JSONB —
  tweakable via SQL without a deploy (~60s cache).
- **Engine** — `app/lib/fantasy/`: `scoring.ts` (pure points + squad totals +
  transfer cost), `validation.ts` (username + squad rules), `provider.ts`
  (the ONLY module that talks to API-Football), `referral-math.ts` (pure
  cumulative-activation math), `worker.ts` (tick orchestration),
  `notifications.ts` (Brevo + dedupe), `server.ts`/`settings.ts` (helpers).
- **API** — `app/api/play/*`: join/username/players/squad/transfers/captain/
  leaderboard/rewards/opt-in/matchday (user-facing), `worker` (scheduler),
  `admin/*` (support), `og` (share card image).
- **Frontend** — `app/play/*` pages + `app/components/play/*`.
- **Scheduler** — a Cloudflare Worker managed directly in the Cloudflare
  dashboard (**not** part of this repo — there is no `workers/` directory).
  One Cron Trigger (`* * * * *`) fans out to both `APP_URL_PROD` and
  `APP_URL_STAGING`, POSTing `/api/play/worker` on each with the shared
  `FANTASY_WORKER_SECRET`. Cron Triggers can't go sub-minute, so whichever
  domain(s) report `data.live_window_active: true` (a game is on) get a
  second tick ~30s later — otherwise it's once a minute per domain. The CF
  worker is only the alarm clock; all logic, including every API-Football
  call, runs in the Next.js app.

### Worker tick (every minute, twice a minute while a game is live)

1. Clock transition `upcoming→live` at `lock_at`.
2. Fixture refresh from API-Football — **provider-frugal**: every tick only
   inside an active window (lock → last kickoff +4h); once per 15 min while a
   round is upcoming; never otherwise. User traffic never hits the provider.
3. Per-fixture stats sync: continuous while live and until FT+15m, then one
   reconciliation pass at ≥FT+2h and one at ≥FT+12h, after which the fixture's
   stats freeze (`stats_finalized`).
4. Status transitions from fixture state: `live→finalizing` (all fixtures
   finished — triggers **rollover**: previous_rank snapshot, squads cloned to
   the next matchday with fresh free transfers, eliminated teams deactivated
   TBD-safely) and `finalizing→final` (all stats frozen — triggers recap).
5. Score recompute (idempotent, from raw stats): matchday scores → participant
   totals → ranks via the leaderboard view (O-4 tie-breakers in SQL).
6. Referral sweep (DB-only, every 5 min): cumulative USD per referred wallet
   (stables at par, CNGN × `cngn_usd_rate`, transfers excluded), first-touch
   attribution, `activated_at` = crossing transaction's timestamp.
7. Emails (if `features.emails` + Brevo configured): T−24h matchday reminder,
   "one away" from qualification, matchday recap — deduped via
   `fantasy_notifications`, ≤50 sends per tick.

The tick returns a JSON report (transitions, sync counts, provider rate-limit
remaining, alerts) — visible in the Cloudflare dashboard's Worker logs.

## Runbook

### 1. Migrate

Apply the two `20260704…` migrations (supabase CLI or dashboard SQL editor).

### 2. Seed

```bash
cd scripts && pnpm install
SUPABASE_URL=… SUPABASE_SECRET_KEY=… API_FOOTBALL_KEY=… pnpm seed:fantasy
```

Creates matchdays 6/7/8 (lock = earliest kickoff of the round), fixtures, and
the player pool from Round-of-16 teams with heuristic prices
(base by position + rating/goals/appearances, 0.5 steps, clamped 4.0–11.0).
Idempotent; ~50 API calls (fits the free tier). Adjust prices later with SQL:
`UPDATE fantasy_players SET price = 9.5 WHERE name ILIKE '%mbappe%';`

### 3. Deploy the scheduler

The scheduler is a small Worker script pasted directly into the Cloudflare
dashboard (Workers & Pages → Create → paste script), not deployed from this
repo.

Configure on the Worker (Settings → Variables and Secrets):

| Name | Type | Value |
| --- | --- | --- |
| `APP_URL_PROD` | Plain text | `https://noblocks.xyz` |
| `APP_URL_STAGING` | Plain text | staging app URL |
| `FANTASY_WORKER_SECRET` | Encrypted | same value as the app env |

Then add a Cron Trigger (Settings → Triggers): `* * * * *`.

The script fans out to both domains every tick and gives whichever domain(s)
report a live game a second tick ~30s later. Ask in-thread for the current
script if it needs re-pasting — it isn't tracked in git.

Manual tick (also `{"force": true}` to bypass frugality gating):

```bash
curl -X POST https://noblocks.xyz/api/play/worker \
  -H "x-internal-auth: $FANTASY_WORKER_SECRET" -H "content-type: application/json" -d '{}'
```

### 3b. Internal test mode — score the Round of 16

The public campaign scores MD6–8 only, but the whole pipeline can be
exercised against live R16 games by seeding the R16 as matchday 5:

```bash
cd scripts
SEED_INCLUDE_R16=true SEED_SKIP_PLAYERS=true \
  SUPABASE_URL=… SUPABASE_SECRET_KEY=… API_FOOTBALL_KEY=… pnpm seed:fantasy
```

- `SEED_INCLUDE_R16=true` seeds MD5 ("Round of 16") with lock_at = the next
  not-yet-started R16 kickoff (build window stays open mid-round) and adds
  `MD5` nation-cap/free-transfer keys to `fantasy_settings.config`.
- `SEED_SKIP_PLAYERS=true` skips squad/ratings fetching on re-runs (~50
  provider calls saved — players are already seeded).
- MD5 becomes the current matchday: build squads, then fire worker ticks
  (`{"force":true}`) around kickoffs to watch stats/points/leaderboard move.
  Already-finished R16 fixtures are backfilled on the first ticks (2 provider
  calls per fixture per pass — mind the free-tier quota; ticks only run when
  you curl them). When the R16 ends, rollover into MD6 runs for real.

**Before public launch, remove the test round:**

```sql
DELETE FROM public.fantasy_matchdays WHERE id = 5;      -- cascades fixtures/squads/scores
UPDATE public.fantasy_settings
   SET config = (config #- '{nation_caps,MD5}') #- '{free_transfers,MD5}';
UPDATE public.fantasy_participants
   SET total_points = 0, current_rank = NULL, previous_rank = NULL;
```

(Totals reset is safe pre-launch: no scored matchday exists yet. Optionally
also clear test participants/squads entirely.)

### 4. Launch

Set `NEXT_PUBLIC_FANTASY_ENABLED=true` (explicit opt-in — unset or any other
value keeps `/play` and `/api/play/*` 404ing).
Flip emails on when ready:
`UPDATE fantasy_settings SET config = jsonb_set(config, '{features,emails}', 'true');`

### 5. Validate scoring (golden-file check)

After the first real fixtures finish, compare a handful of players against the
official FPL-style breakdowns: `SELECT player_id, points, breakdown FROM
fantasy_player_match_stats WHERE provider_fixture_id = …` — the `breakdown`
JSONB lists every reason. Adapted-rule deltas to expect: key passes stand in
for big chances (2-for-1), FK bonus only when the feed labels the goal type,
vice fallback is unconditional, bench never auto-subs.

### 6. Winners & payout

```bash
curl -H "x-admin-key: $FANTASY_ADMIN_KEY" \
  "https://noblocks.xyz/api/play/admin/winners?format=csv" -o winners.csv
```

Qualified-only ordering; non-qualified/opted-out/disqualified are skipped
(never shifted into prizes). Ties per O-4: points, earlier join, more
activated referrals. Support tools live at `/play/admin`.

## Teardown (post-campaign)

1. Delete the CF worker and its Cron Trigger from the Cloudflare dashboard —
   it isn't tracked in this repo.
2. Remove `/play` pages, `app/components/play/`, `/api/play/*`,
   `app/lib/fantasy/`, the middleware matcher entries and the fantasy flag.
3. Drop the DB objects (order matters for views):

```sql
DROP VIEW IF EXISTS public.fantasy_leaderboard;
DROP VIEW IF EXISTS public.fantasy_qualification;
DROP TABLE IF EXISTS
  public.fantasy_notifications, public.fantasy_referral_progress,
  public.fantasy_matchday_scores, public.fantasy_player_match_stats,
  public.fantasy_transfers, public.fantasy_squad_players,
  public.fantasy_squads, public.fantasy_participants,
  public.fantasy_players, public.fantasy_fixtures,
  public.fantasy_matchdays, public.fantasy_settings CASCADE;
DROP FUNCTION IF EXISTS public.fantasy_touch_updated_at();
DROP FUNCTION IF EXISTS public.fantasy_set_captain(uuid, bigint, bigint);
DROP FUNCTION IF EXISTS public.fantasy_save_squad(uuid, text, integer, numeric, boolean, jsonb);
DROP FUNCTION IF EXISTS public.fantasy_apply_transfers(uuid, text, integer, numeric, jsonb, jsonb, integer);
```

The `user_kyc_profiles.username` column **stays** — it's a durable profile
field beyond the campaign.

## Tests

```bash
pnpm jest __tests__/fantasy-scoring.test.ts __tests__/fantasy-validation.test.ts \
  __tests__/fantasy-worker-scoring.test.ts __tests__/fantasy-referral-sweep.test.ts \
  __tests__/fantasy-transfer-cost.test.ts
```

Covers the scoring matrix, squad validation, provider-normalization →
scoring pipeline (stubbed API-Football payloads), cumulative referral
activation (crossing-timestamp edges) and transfer costs.
