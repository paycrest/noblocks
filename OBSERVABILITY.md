# Observability

How noblocks reports to Datadog, and how to verify it works. The setup mirrors
the `aggregator` service (dd-trace + structured JSON logs + an agent sidecar),
adapted for Next.js and DigitalOcean.

Datadog org: **EU** (`datadoghq.eu`). Anything pointed at `datadoghq.com` will
silently send to the wrong place.

## Signals

| Signal | Source | Reaches Datadog via |
| --- | --- | --- |
| Browser RUM | `app/lib/datadog.client.ts` | Browser → Datadog directly (consent-gated) |
| APM traces | `instrumentation.ts` (dd-trace) | Agent, port 8126 |
| Server logs | `app/lib/logger.ts` (pino → stdout) | Agent, container log collection |
| Runtime metrics | dd-trace `runtimeMetrics` | Agent, DogStatsD 8125 |

Application code never holds a Datadog API key. Only the agent does.

## Architecture

```text
┌───────────────────┐   stdout (JSON)    ┌──────────────┐
│  noblocks (Next)  │───────────────────▶│              │
│                   │   traces :8126     │  DD Agent    │──▶ datadoghq.eu
│  instrumentation  │───────────────────▶│  (sidecar)   │
│  logger (pino)    │   dogstatsd :8125  │              │
└───────────────────┘───────────────────▶└──────────────┘
        │
        │ RUM (browser, consent-gated)
        └────────────────────────────────────────────────▶ datadoghq.eu
```

## Deploying the agent (DigitalOcean, Docker)

1. On the host, create `.env.datadog` from `.env.datadog.example` and set
   `DD_API_KEY` from the [EU org](https://app.datadoghq.eu/organization-settings/api-keys).
2. Bring the agent up alongside the app, on the same Docker network:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.datadog.yml up -d
   ```

3. Set `DD_AGENT_HOST=datadog-agent` in the app container's environment (plus
   the rest of the `DD_*` block in `.env.example`).

The agent ports are bound to `127.0.0.1` and the Docker network. **Do not
publish 8125/8126 on a public interface** — an open trace intake accepts
arbitrary spans from anyone who can reach it.

> **If noblocks moves to DigitalOcean App Platform** rather than a Droplet,
> this sidecar does not apply: App Platform gives no Docker socket and no
> co-located container. That would need a different transport for traces, and
> the log path would have to change too. Confirm which product is in use before
> relying on this file.

## Writing logs

Use the shared logger, not `console`:

```ts
import logger from "@/app/lib/logger";

logger.info({ feature: "play", matchday_id: 12 }, "squad saved");
logger.error({ err: error, feature: "play" }, "squad save failed");
```

The object comes **first** and becomes queryable attributes (`@feature:play`);
the string is the message. Reversing them stringifies your data into the
message and makes it unsearchable.

`logger` stamps `dd.trace_id` / `dd.span_id` automatically, which is what makes
the **View Trace** link appear on a log line in the Logs Explorer.

### Why not `console`

`next.config.mjs` sets `compiler.removeConsole` in production. This transform
applies to **server** code, not just the browser bundle — a blanket `true`
previously stripped every `console.error` in the API routes from production
builds, so no agent or log drain could have collected them. It is now
`{ exclude: ["warn", "error", "info"] }`: those three survive, `console.log` is
still stripped. Structured logging through `logger` avoids the question
entirely and produces parseable JSON.

## Fantasy worker telemetry

The Play scoring worker is driven by an external Cloudflare cron, so RUM cannot
see it. `app/lib/fantasy/telemetry.ts` emits one structured line per tick,
flattened into `@worker.*` attributes:

| Attribute | Meaning |
| --- | --- |
| `@worker.ok` | `false` when the tick threw |
| `@worker.alerts_count` / `@worker.alerts` | Failures *inside* an otherwise-200 tick |
| `@worker.duration_ms` | Tick wall time |
| `@worker.provider_remaining` | API-Football calls left today |
| `@worker.scores_recomputed` / `@worker.stats_synced` | Work done |
| `@worker.live_window_active` | A matchday window is open |
| `@worker.did_rollover` | Gameweek advanced this tick |

Ticks carrying alerts log at `warn` even though the request returned 200 —
rollover and score recompute can fail inside a successful tick, and that is the
failure mode worth alerting on.

### Monitors worth having

Every query below is scoped `env:production`. **Do not drop that scope.** Staging
shares this Datadog org, so an unscoped absence monitor is satisfied by staging
ticks and a production outage would never page — the monitor inverted into a
liability. The threshold monitors would likewise fire on staging noise.

| Monitor | Query | Why |
| --- | --- | --- |
| **No tick in 10 minutes → page** | absence of `service:noblocks env:production @feature:play @worker.ran_at:*` | Cron is `*/5`; two misses means scores silently stopped updating |
| Alerts sustained 15 min → Slack | `service:noblocks env:production @feature:play @worker.alerts_count:>0` | Internal failure inside a 200 |
| Provider budget low → Slack | `service:noblocks env:production @feature:play @worker.provider_remaining:<200` | Before the API-Football wall |
| Crashed tick → Slack | `service:noblocks env:production @feature:play @worker.ok:false` | Tick threw outright |

The first one is the one that matters. When the cron dies, nothing else
anywhere reports it.

## KYC telemetry

The KYC flow reports through `app/lib/kyc-telemetry.ts`: one structured line per
step outcome, message `kyc step`, flattened into `@kyc.*` attributes. Its
purpose is answering "why did this user's upgrade fail?" from the Logs Explorer
instead of asking the user what the screen said.

Every exit path in the KYC routes emits exactly one line — the tier 1 OTP send
and verify, the tier 2 ID submission and its async Smile ID callback, and the
tier 3 address check. `/api/kyc/status` reports failures only; every KYC surface
polls it, so its successes would bury everything else.

| Attribute | Meaning |
| --- | --- |
| `@kyc.step` | `signup_email`, `phone_otp_send`, `phone_otp_verify`, `id_verification`, `id_callback`, `address_verification`, `status` |
| `@kyc.outcome` | `success`, `rejected`, `error`, `noop` (see below) |
| `@kyc.ok` | `true` only on `success` — the boolean twin of `outcome` |
| `@kyc.detail` | **The provider's own words.** Smile ID `ResultText`, Dojah's message, the Postgres error |
| `@kyc.reason` | Stable cause: `provider_rejected`, `attempts_exhausted`, `duplicate_id_document`, `invalid_otp`, `supabase_error`, … |
| `@kyc.stage` | Where in the route: `provider_verify`, `profile_update`, `attempt_counter`, `otp_check`, … |
| `@kyc.failure_category` | `classifySmileIdFailure` output: `quality`, `liveness`, `mismatch`, `database`, `general` |
| `@kyc.wallet_address` | Lower-cased. The key support searches on |
| `@kyc.tier_from` / `@kyc.tier_to` / `@kyc.promoted` | The tier change, and whether one happened |
| `@kyc.attempt` / `@kyc.attempts_remaining` | How close the user is to being locked out |
| `@kyc.provider` / `@kyc.provider_code` / `@kyc.job_id` | `smile_id`, `dojah`, `kudisms`, `twilio`, `supabase`, plus their codes |
| `@kyc.duration_ms` / `@kyc.status_code` | Wall time and the HTTP status returned |

`outcome` is the distinction that makes alerting possible. A `rejected` line is
a legitimate refusal — a mistyped OTP, a blurry document, Smile ID saying no —
and logs at `warn`. An `error` line is our fault, the database's, or a
provider's, and logs at `error`. Without the split, an outage monitor would be
drowned by users fat-fingering their OTP. `noop` (info) covers work that
correctly did nothing, chiefly a Smile ID callback arriving after the
synchronous path already promoted the profile.

### Supporting a user

```text
service:noblocks env:production @feature:kyc @kyc.wallet_address:0x1234…
```

Lower-case the address — the facet is normalised, and a checksummed address
pasted verbatim will not match. Read `@kyc.detail` for the underlying reason,
`@kyc.attempts_remaining` for whether they can retry, and **View Trace** for the
request itself.

### Monitors worth having

As with the worker monitors above, every query is scoped `env:production`.
**Do not drop that scope** — staging shares this Datadog org.

| Monitor | Query | Why |
| --- | --- | --- |
| **KYC infrastructure failure → page** | `service:noblocks env:production @feature:kyc @kyc.outcome:error` | Smile ID, Dojah, or Supabase is failing upgrades; users cannot verify at all |
| Provider outage burning attempts → Slack | `@feature:kyc @kyc.failure_category:database` | Smile ID infrastructure failures, which refund the attempt — a spike means the provider, not our users |
| Verified-and-lost → page | `@feature:kyc @kyc.stage:profile_update @kyc.outcome:error` | The provider approved them and the write failed: the user spent an attempt and stayed on the old tier |
| Callback signature failures → Slack | `@feature:kyc @kyc.reason:invalid_signature` | A genuine Smile ID callback never fails this |
| Rejection mix → dashboard | `@feature:kyc @kyc.outcome:rejected`, grouped by `@kyc.reason` and `@kyc.id_type` | Which ID types and reasons dominate; the input to fixing the flow rather than individual tickets |

### Client-side

`reportClientError` (`app/lib/sentry.client.ts`) forwards to
`datadogRum.addError` alongside GlitchTip, so KYC failures that never reach the
API — a dropped request, a refused camera, a wallet rejection — surface in RUM
Error Tracking under their `feature` tag. RUM is consent-gated, so the server
lines remain the complete record.

### PII

Wallet address is logged in the clear: it is the key support needs, and it is
what these routes already logged. Phone numbers, emails, ID numbers, dates of
birth, names and document images are never logged. Because Smile ID and Dojah
quote the failing input back in their rejection messages, `sanitizeDetail`
masks runs of six or more digits and anything email-shaped before a line ships —
short numbers like result codes stay readable.

## Verifying

Deploy, wait ~60s, then in the **EU** app:

| Check | Where |
| --- | --- |
| APM service appears | APM → Services → `noblocks` |
| Logs flowing | Logs Explorer → `service:noblocks env:production` |
| Trace–log correlation | Open a log line → **View Trace** is present |
| Worker ticks | Logs → `@feature:play @worker.ran_at:*` |
| KYC steps | Logs → `@feature:kyc @kyc.step:*` |
| RUM | RUM → Applications |
| Service Catalog | Software → `noblocks` |

Agent-side, from the host:

```bash
docker exec datadog-agent agent status     # APM + Logs Agent sections
docker logs datadog-agent --tail 50
```

## Gotchas

- **`runtimeMetrics` needs a native build.** `@datadog/native-metrics` is a
  native addon; pnpm blocks install scripts by default. `package.json` lists it
  under `pnpm.onlyBuiltDependencies` so CI and image builds compile it. Without
  that, dd-trace degrades to no runtime metrics rather than failing loudly.
- **`dd-trace` and `pino` are in `serverExternalPackages`.** dd-trace patches
  modules at require time and pino resolves transports through worker threads;
  bundling either breaks it.
- **`instrumentation.ts` is stable in Next 15** — it needs no
  `experimental.instrumentationHook`, and that flag no longer exists.
- **The tracer skips the Edge runtime.** `middleware.ts` runs on Edge, where
  dd-trace cannot load, so middleware is not traced.
- **RUM is consent-gated** (`cookieConsent.analytics`). RUM counts are
  consenting users, not all users — keep Mixpanel as the funnel source of truth.
