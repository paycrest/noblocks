# Datadog agent on DigitalOcean App Platform

Noblocks server-side APM (`instrumentation.ts`) sends traces to a Datadog Agent
over `DD_AGENT_HOST:8126`. On App Platform there is no Docker socket, so the
agent runs as an **internal service** component in the same app as the web
service (not a worker — workers cannot receive inbound traffic). This mirrors
`paycrest/aggregator` (`deploy/datadog-agent`).

Logs are **not** collected by the agent on App Platform. Configure a Datadog
**log destination** on the noblocks app so stdout JSON from `app/lib/logger.ts`
reaches `datadoghq.eu`.

**DogStatsD / runtime metrics:** App Platform internal ports are TCP-only. APM
on port **8126** works; UDP DogStatsD on **8125** does not. `dd-trace`
`runtimeMetrics` in `instrumentation.ts` will not ship on App Platform until a
supported metrics path exists — traces and log correlation still work.

## Steps

1. Copy `app-platform.service.yaml.example` into your App Platform app spec (or
   add an equivalent **service** with `internal_ports: [8126]` in the control
   panel).
2. Name the service `datadog-agent` (or set `DD_AGENT_HOST` on the web service
   to whatever name you choose).
3. Create a **secret** env var `DD_API_KEY` on the agent service from the
   [EU API keys](https://app.datadoghq.eu/organization-settings/api-keys) page.
4. On the **web** service, set the `DD_*` variables listed in
   [OBSERVABILITY.md](../../OBSERVABILITY.md#digitalocean-app-platform-staging--production).
5. Add the Datadog log drain for the web service (EU site).
6. Redeploy and verify APM → `noblocks` and log → trace correlation (**View
   Trace** on a log line).

## Local / Droplet Docker

Use [docker-compose.datadog.yml](../../docker-compose.datadog.yml) instead; see
OBSERVABILITY.md § “Deploying the agent (DigitalOcean, Docker)”.
