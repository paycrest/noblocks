# Datadog agent on DigitalOcean App Platform

Noblocks server-side tracing (`instrumentation.ts`) and runtime metrics send to
a Datadog Agent over `DD_AGENT_HOST:8126`. On App Platform there is no Docker
socket, so the agent runs as a **worker component** in the same app as the web
service — the same pattern as `paycrest/aggregator` (`deploy/datadog-agent`).

Logs are **not** collected by this worker on App Platform. Configure a Datadog
**log destination** on the noblocks app so stdout JSON from `app/lib/logger.ts`
reaches `datadoghq.eu`.

## Steps

1. Copy `app-platform.worker.yaml.example` into your App Platform app spec (or
   add an equivalent worker in the control panel).
2. Name the worker `datadog-agent` (or set `DD_AGENT_HOST` on the web service
   to whatever name you choose).
3. Create a **secret** env var `DD_API_KEY` on the worker from the
   [EU API keys](https://app.datadoghq.eu/organization-settings/api-keys) page.
4. On the **web** service, set the `DD_*` variables listed in
   [OBSERVABILITY.md](../../OBSERVABILITY.md#digitalocean-app-platform-staging--production).
5. Add the Datadog log drain for the web service (EU site).
6. Redeploy and verify APM → `noblocks` and log → trace correlation (**View
   Trace** on a log line).

## Local / Droplet Docker

Use [docker-compose.datadog.yml](../../docker-compose.datadog.yml) instead; see
OBSERVABILITY.md § “Deploying the agent (DigitalOcean, Docker)”.
