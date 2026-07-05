# noblocks-fantasy-scheduler

Cloudflare Worker that acts as the **alarm clock** for the Noblocks Play
fantasy league. Every minute (`* * * * *` cron trigger) it POSTs
`${APP_URL}/api/play/worker` with the `x-internal-auth` shared secret.

**All game logic lives in the Next.js app** (fixture sync, stats, scoring,
rollover, referral sweep, notifications). This worker holds no state and makes
no decisions — if the app decides no matchday window is active, the endpoint
returns quickly and no API-Football calls are made. Failures here are logged,
not thrown, so the cron never retry-storms the app.

## Deploy

Prerequisites: a Cloudflare account and `pnpm install` in this directory
(installs `wrangler` locally; `pnpm wrangler login` on first use).

1. Set the shared secret (must equal `FANTASY_WORKER_SECRET` — or the
   `INTERNAL_API_KEY` fallback — configured on the Next.js app):

   ```bash
   pnpm wrangler secret put FANTASY_WORKER_SECRET
   ```

2. Check `APP_URL` in `wrangler.toml` (`[vars]`, default
   `https://noblocks.xyz`). For a staging deploy, point it at the staging app
   or override at deploy time:

   ```bash
   pnpm wrangler deploy --var APP_URL:https://staging.noblocks.xyz
   ```

3. Deploy:

   ```bash
   pnpm wrangler deploy
   ```

## Observe

Live-tail production logs (each tick logs the endpoint's HTTP status and a
response-body snippet):

```bash
pnpm wrangler tail
```

Test locally without waiting for the cron (runs the `scheduled` handler on
demand):

```bash
pnpm wrangler dev --test-scheduled
# then, in another shell:
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

## Teardown (post-campaign)

```bash
pnpm wrangler delete
```
