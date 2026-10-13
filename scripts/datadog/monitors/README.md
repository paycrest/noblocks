# Datadog monitors (EU)

JSON definitions mirror the tables in [OBSERVABILITY.md](../../OBSERVABILITY.md).
They are **not** applied automatically by CI; use them as the source of truth
when creating or updating monitors in the Datadog EU UI or via API/Terraform.

## Import

1. Open [Monitors](https://app.datadoghq.eu/monitors/manage) in the EU org.
2. Create from JSON (API) or manually copy `query` and `message` from
   `noblocks-play-production.json`.
3. Keep `@env:production` (log **attribute**, not tag) in every log query —
   DigitalOcean log forwarding does not set the Datadog `env` tag. Staging shares
   the org, so scope production monitors with `@env:production` (use
   `@env:staging` for staging-only monitors).
4. Before importing monitors that use range filters (`@worker.alerts_count:>0`,
   `@worker.provider_remaining:<200`), open **Logs Explorer**, pick a noblocks
   log line, and use **Facets** (log side panel) to confirm
   `@worker.alerts_count` and `@worker.provider_remaining` are **numerical**
   facets. If a field is missing or typed as a string, create or edit a
   **numerical facet** there before relying on range filters in these monitors.

## Files

| File | Purpose |
| --- | --- |
| `noblocks-play-production.json` | Fantasy worker tick / alert monitors |
