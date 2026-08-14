# Noblocks Play — Premier League Fantasy

Free-to-play fantasy football for the **Premier League 2026/27 season** (Gameweeks
1–38). Managers build a 15-player squad within £100m, set a starting XI and
captain before each deadline, and climb a global leaderboard. Private
**mini-leagues** let friends compete week to week.

**Rewards:** the game engine has **no built-in prize pool or guaranteed payouts**.
Marketing may run separate promotions (social, email, GW challenges, etc.) with
their own rules and amounts — see `/play/terms` §3. Ops tooling for campaign
payouts lives in `/play/admin` and `/api/play/admin/*`.

Everything is isolated behind the `fantasy_` DB prefix, `/play` pages,
`/api/play/*` routes and `app/lib/fantasy/*` — removable as a unit when the
season ends.

---

## Product surface

| Route | Purpose |
| --- | --- |
| `/play` | Campaign landing, join flow |
| `/play/team` | Squad builder, transfers, captain |
| `/play/leaderboard` | Global rankings |
| `/play/rewards` | Mini-leagues hub (tab label: **Leagues**). Invite links: `/play/rewards?join=CODE` |
| `/play/matchday/[id]` | Round fixtures and live context |
| `/play/manager/[username]` | Public read-only team view |
| `/play/terms` | Terms & conditions |
| `/play/admin` | Ops console (admin key in sessionStorage) |

User-facing APIs are gated by `NEXT_PUBLIC_FANTASY_ENABLED=true`. When
`NEXT_PUBLIC_FANTASY_CAMPAIGN_ENDED=true`, public `/play` shows the
campaign-ended state; `/play/admin` and the worker keep working.

---

## Season model

- **League:** API-Football Premier League — `league=39`, `season=2026`
- **Matchday ids:** `100 + gameweek` (GW1 → `101`, GW38 → `138`)
- **Deadline:** earliest fixture kickoff minus 90 minutes (`lock_at`)
- **Budget:** £100m · **Club cap:** 3 players per club
- **Free transfers:** bank up to 5; extra transfers cost 4 points each
- **Scoring:** FPL-style matrix in `fantasy_settings.config` (appearance, goals,
  assists, clean sheets, cards, saves, etc.)
- **Autosubs:** bench players auto-promote when starters do not play (see
  `app/lib/fantasy/autosubs.ts`)

Legacy World Cup matchdays (`6`, `7`, `8`) remain in the DB for history but are
marked `final` and excluded from `getCurrentMatchday()`.

---

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `API_FOOTBALL_KEY` | Next.js app + seed script | API-Football (api-sports.io) key. EPL = league 39, season 2026. Dev: free tier (~100 req/day). Production: Pro tier recommended. |
| `FANTASY_WORKER_SECRET` | Next.js app + CF worker | Auth for `POST /api/play/worker` (`x-internal-auth`). Falls back to `INTERNAL_API_KEY` when unset. |
| `FANTASY_ADMIN_KEY` | Next.js app | Auth for `/api/play/admin/*` (`x-admin-key`). Unset ⇒ admin API returns 401. |
| `NEXT_PUBLIC_FANTASY_ENABLED` | Next.js app | Must be exactly `"true"` to serve user-facing `/play` UI and `/api/play/*` (except worker/admin). |
| `NEXT_PUBLIC_FANTASY_CAMPAIGN_ENDED` | Next.js app | When `"true"`, public `/play` shows campaign-ended UI. |
| `FANTASY_LOCAL_TIMELAPSE` | Next.js app (non-prod only) | With `NODE_ENV !== "production"`, enables synthetic fixture/score pipeline for local demos. Pair with `pnpm seed:fantasy:timelapse`. |
| `BREVO_API_KEY` (existing) | Next.js app | Transactional emails. Also gated by `fantasy_settings.config.features.emails`. |
| `BREVO_SENDER_EMAIL` (optional) | Next.js app | Sender for fantasy emails; defaults to `no-reply@noblocks.xyz`. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (existing) | app + seed script | Service-role DB access. |

---

## Architecture

### Database

Apply migrations in order:

1. `20260704120000_add_username_to_user_kyc_profiles.sql`
2. `20260704120001_create_fantasy_tables.sql` — core `fantasy_*` tables,
   `fantasy_leaderboard` view, RLS deny-all / service-role only
3. `20260710120000_bank_xi_points_at_kickoff.sql` — kickoff XI stamping for
   accurate in-play scoring
4. `20260811120000_epl_fantasy_season.sql` — EPL season config, mini-leagues,
   GW challenges, leaderboard without referral qualification, unique
   `gameweek_id` on challenges, simplified `fantasy_save_squad`, worker overlap
   RPCs (`fantasy_worker_try_acquire` / `_release`), dropped `xi_at_kickoff`,
   atomic challenge/join/leave RPCs (`fantasy_create_challenge`,
   `fantasy_join_participant`, `fantasy_leave_league`); REVOKE EXECUTE FROM PUBLIC
   on all SECURITY DEFINER functions

Rules (scoring matrix, budget, formations, flags) live in
`fantasy_settings.config` JSONB — tweakable via SQL without a deploy (~60s
cache in `app/lib/fantasy/settings.ts`).

Key tables beyond the core squad/score model:

- `fantasy_leagues` / `fantasy_league_members` — private mini-leagues
- `fantasy_challenges` — marketing GW challenges (ops-created, not shown as
  fixed player-facing prize tiers)

### Engine (`app/lib/fantasy/`)

| Module | Role |
| --- | --- |
| `scoring.ts` | Pure points + squad totals + transfer cost |
| `autosubs.ts` | Bench promotion when starters miss out |
| `bonus.ts` | Matchday bonus points (e.g. NMB) |
| `validation.ts` | Username + squad rules |
| `provider.ts` | **Only** module that calls API-Football |
| `worker.ts` | Tick orchestration (`runWorkerTick`) |
| `worker/fixtures.ts` | Fixture refresh, stats sync, timelapse |
| `worker/scoring.ts` | Score recompute, participant batch upserts, overlap lock |
| `worker/rollover.ts` | Squad clone between gameweeks |
| `worker/notify.ts` | Matchday emails |
| `challenges.ts` | GW challenge resolution (admin + worker) |
| `leagues.ts` | Mini-league CRUD and standings |
| `notifications.ts` | Brevo emails + dedupe |
| `fixture-activity.ts` | Client poll gating (active fixtures / finalizing) |
| `server.ts` / `settings.ts` | Route helpers, settings cache |
| `players.ts` | Cached `getPlayersMap` (5m TTL, `fetchAll`) — invalidated on worker rescore clear |
| `pagination.ts` | `fetchAll` / `fetchAllIn` — paginated reads and chunked `.in()` filters |

### API (`app/api/play/`)

**User-facing (Privy JWT):** `join`, `username/check`, `players`, `squad`,
`transfers`, `captain`, `leaderboard`, `rewards` (leagues hub), `leagues`,
`leagues/join`, `leagues/leave`, `matchdays`, `matchday/[id]`,
`manager/[username]`, `og`

**Internal:** `worker` (scheduler tick)

**Admin (`x-admin-key`):** `admin/participants`, `admin/disqualify`,
`admin/username`, `admin/challenges`, `admin/winners`

All `/api/play/*` handlers use `withRateLimitAndAnalytics` (same request/
response/error telemetry as `/api/referral/*`).

Legacy `opt-in` route remains for DB compatibility; join always sets
`giveaway_opt_in=true` and the player UI no longer exposes opt-in.

### Scheduler

A Cloudflare Worker managed in the Cloudflare dashboard (**not** in this repo).
One Cron Trigger (`*/5 * * * *`) POSTs `/api/play/worker` on prod and staging
with `x-internal-auth: $FANTASY_WORKER_SECRET`.

When the tick returns `live_window_active: true`, the CF script loops in-process
every ~30s (bounded to just under 5 minutes) before the next cron firing.
Otherwise one tick per 5 minutes per domain. All API-Football calls run inside
the Next.js app, never from user requests.

---

## Worker tick

Typical order each tick (skips immediately if another tick holds a non-stale
claim in `fantasy_worker_runs`):

1. **Timelapse branch** (local only) — synthetic fixtures/stats when
   `FANTASY_LOCAL_TIMELAPSE=true` and `NODE_ENV !== "production"`.
2. **Clock** — `upcoming → live` at `lock_at`.
3. **Fixture refresh** — provider-frugal: only inside active window (lock → last
   kickoff +4h) or once per 15 min while upcoming.
4. **Stats sync** — continuous while live until FT+15m; reconciliation until
   FT+2h then `stats_finalized`. Reset `stats_finalized` in SQL to force
   re-pull after vendor corrections.
5. **Matchday transitions** — `live → finalizing` (rollover: rank snapshot, squad
   clone, free transfers) and `finalizing → final`.
6. **Score recompute** — idempotent from raw stats → matchday scores → batch
   participant totals/ranks via `fantasy_leaderboard`.
7. **Challenge resolve** — open/locked challenges for finalized gameweeks
   (`resolveChallengesForGameweek`).
8. **Emails** (if `features.emails` + Brevo) — matchday reminder, recap;
   deduped via `fantasy_notifications`, ≤50 sends per tick.

The tick returns a JSON report (`transitions`, `stats_synced`, `alerts`,
`provider_rate_limit`, etc.) — check CF Worker logs or curl the endpoint
directly.

Manual tick:

```bash
curl -X POST https://noblocks.xyz/api/play/worker \
  -H "x-internal-auth: $FANTASY_WORKER_SECRET" \
  -H "content-type: application/json" \
  -d '{}'
```

Force fixture refresh and score recompute (ops/debug):

```bash
curl -X POST https://noblocks.xyz/api/play/worker \
  -H "x-internal-auth: $FANTASY_WORKER_SECRET" \
  -H "content-type: application/json" \
  -d '{"force": true}'
```

---

## Runbook

### 1. Migrate

Apply all four fantasy migrations listed above (Supabase CLI or SQL editor).

### 2. Seed

From `noblocks/`:

```bash
SUPABASE_URL=… SUPABASE_SECRET_KEY=… API_FOOTBALL_KEY=… pnpm seed:fantasy
```

Creates matchdays **101–138**, fixtures from API-Football, and the full player
pool with heuristic prices. Idempotent; first run uses many provider calls
(fetch all teams + ratings). Re-runs:

```bash
SEED_SKIP_PLAYERS=true SUPABASE_URL=… SUPABASE_SECRET_KEY=… API_FOOTBALL_KEY=… pnpm seed:fantasy
```

Adjust prices in SQL if needed:

```sql
UPDATE fantasy_players SET price = 9.5 WHERE name ILIKE '%salah%';
```

### 3. Local timelapse (optional)

Compress several gameweeks into ~48 hours for mechanic testing:

```bash
FANTASY_LOCAL_TIMELAPSE=true pnpm seed:fantasy:timelapse
# restart dev server with FANTASY_LOCAL_TIMELAPSE=true
# POST /api/play/worker with x-internal-auth to advance synthetic fixtures
```

**Never** set `FANTASY_LOCAL_TIMELAPSE=true` in production (`NODE_ENV=production`
hard-blocks timelapse either way).

### 4. Deploy the scheduler

Configure the Cloudflare Worker (Settings → Variables):

| Name | Value |
| --- | --- |
| `APP_URL_PROD` | `https://noblocks.xyz` |
| `APP_URL_STAGING` | staging URL |
| `FANTASY_WORKER_SECRET` | same as the app deployment |

Cron: `*/5 * * * *`. The worker script is maintained in Cloudflare, not git.

### 5. Launch

1. Set `NEXT_PUBLIC_FANTASY_ENABLED=true` on deployment (explicit opt-in).
2. Set `NEXT_PUBLIC_FANTASY_CAMPAIGN_ENDED=false`.
3. Confirm `fantasy_settings.config.features.join_open` is `true` (default in
   EPL migration).
4. Optional — enable emails when Brevo is ready:

```sql
UPDATE fantasy_settings
SET config = jsonb_set(config, '{features,emails}', 'true')
WHERE id = 1;
```

### 6. Validate scoring

After real fixtures finish, spot-check breakdowns:

```sql
SELECT player_id, points, breakdown
FROM fantasy_player_match_stats
WHERE provider_fixture_id = …;
```

Run the test suite:

```bash
pnpm jest __tests__/fantasy
```

### 7. Marketing campaigns & payouts

GW challenges (mini-league eligibility, two clear GWs anti-abuse):

- Create/resolve at `/play/admin` or `POST /api/play/admin/challenges`.
  Creation validates gameweek id is within `season_matchday_min`–`max` and
  rolling 30-day `prize_usdc` total ≤ 100 USDC (`PRIZE_BUDGET_EXCEEDED`).
  One challenge per gameweek (unique DB constraint).
- Worker auto-resolves when the gameweek goes `final`
- Export winner CSV: `GET /api/play/admin/challenges?id=…&format=csv`

Broader rank exports (e.g. Manager of the Month):

```bash
curl -H "x-admin-key: $FANTASY_ADMIN_KEY" \
  "https://noblocks.xyz/api/play/admin/winners?format=csv" -o winners.csv
```

Payout amounts are configured at campaign time (CSV includes suggested
`prize_usdc` for ops convenience — not a player-facing guarantee). Disqualified
managers are excluded via admin tools; leaderboard ordering uses points then
earlier join time.

---

## Mini-leagues

- Create/join at `/play/rewards` (Leagues tab)
- Invite URL: `/play/rewards?join=INVITECODE`
- Standings are per-league GW/overall points among members
- GW challenges require membership in a league with ≥ `min_league_size` active
  squads and two clear gameweeks since joining that league

Unauthenticated invite visitors see a **Sign in** button (Privy wallet connect).
New users must join Noblocks Play (`/play`) before joining a mini-league.

---

## Pre-launch checklist

- [ ] All four migrations applied in target environment
- [ ] `pnpm seed:fantasy` completed; GW1 `lock_at` looks correct
- [ ] `API_FOOTBALL_KEY`  + sufficient API-Football quota
- [ ] `FANTASY_WORKER_SECRET` matches Cloudflare Worker
- [ ] `FANTASY_ADMIN_KEY` set; `/play/admin` loads
- [ ] CF cron firing; manual worker curl returns 200 + report JSON
- [ ] `DD_API_KEY` set — worker ticks appear in Datadog Logs as `play worker tick`
- [ ] End-to-end: join → squad → mini-league invite link → sign in → join league
- [ ] `NEXT_PUBLIC_FANTASY_ENABLED=true`, `CAMPAIGN_ENDED=false`

---

## Teardown (post-season)

1. Delete the Cloudflare Worker cron trigger.
2. Set `NEXT_PUBLIC_FANTASY_CAMPAIGN_ENDED=true` (or remove `/play` code).
3. Drop DB objects (order matters for views):

```sql
DROP VIEW IF EXISTS public.fantasy_leaderboard;
DROP TABLE IF EXISTS
  public.fantasy_notifications,
  public.fantasy_challenges,
  public.fantasy_league_members,
  public.fantasy_leagues,
  public.fantasy_matchday_scores,
  public.fantasy_player_match_stats,
  public.fantasy_transfers,
  public.fantasy_squad_players,
  public.fantasy_squads,
  public.fantasy_participants,
  public.fantasy_players,
  public.fantasy_fixtures,
  public.fantasy_matchdays,
  public.fantasy_settings CASCADE;
DROP FUNCTION IF EXISTS public.fantasy_touch_updated_at();
DROP FUNCTION IF EXISTS public.fantasy_set_captain(uuid, bigint, bigint);
DROP FUNCTION IF EXISTS public.fantasy_save_squad(uuid, text, integer, numeric, boolean, jsonb);
DROP FUNCTION IF EXISTS public.fantasy_apply_transfers(uuid, text, integer, numeric, jsonb, jsonb, integer);
```

The `user_kyc_profiles.username` column **stays** — durable profile field.

---

## Tests

```bash
pnpm jest __tests__/fantasy
```

Covers scoring, validation, autosubs, bonus, leagues, challenges, worker
pipeline (stubbed provider payloads), fixture-activity polling, transfer costs,
season helpers, and saboteur/security regression suites (~140 tests).
