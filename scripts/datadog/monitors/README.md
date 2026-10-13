# Datadog monitors (EU)

JSON definitions mirror the tables in [OBSERVABILITY.md](../../OBSERVABILITY.md).
They are **not** applied automatically by CI; use them as the source of truth
when creating or updating monitors in the Datadog EU UI or via API/Terraform.

## Import

1. Open [Monitors](https://app.datadoghq.eu/monitors/manage) in the EU org.
2. Create from JSON (API) or manually copy `query` and `message` from
   `noblocks-play-production.json`.
3. Keep `env:production` in every query — staging shares the org.
4. Before importing monitors that use range filters (`@worker.alerts_count:>0`,
   `@worker.provider_remaining:<200`), confirm those facets are **numeric** in the
   EU log index (Logs → Generate Metrics / index mapping). If they are strings,
   adjust the queries or fix log pipeline typing first.

## Files

| File | Purpose |
| --- | --- |
| `noblocks-play-production.json` | Fantasy worker tick / alert monitors |
