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

```
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

| Monitor | Query | Why |
| --- | --- | --- |
| **No tick in 10 minutes → page** | absence of `service:noblocks @feature:play @worker.ran_at:*` | Cron is `*/5`; two misses means scores silently stopped updating |
| Alerts sustained 15 min → Slack | `@worker.alerts_count:>0` | Internal failure inside a 200 |
| Provider budget low → Slack | `@worker.provider_remaining:<200` | Before the API-Football wall |
| Crashed tick → Slack | `@worker.ok:false` | Tick threw outright |

The first one is the one that matters. When the cron dies, nothing else
anywhere reports it.

## Verifying

Deploy, wait ~60s, then in the **EU** app:

| Check | Where |
| --- | --- |
| APM service appears | APM → Services → `noblocks` |
| Logs flowing | Logs Explorer → `service:noblocks env:production` |
| Trace–log correlation | Open a log line → **View Trace** is present |
| Worker ticks | Logs → `@feature:play @worker.ran_at:*` |
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
