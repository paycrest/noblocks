# Datadog monitors (EU)

JSON definitions mirror the tables in [OBSERVABILITY.md](../../OBSERVABILITY.md).
They are **not** applied automatically by CI; use them as the source of truth
when creating or updating monitors in the Datadog EU UI or via API/Terraform.

## Import

1. Open [Monitors](https://app.datadoghq.eu/monitors/manage) in the EU org.
2. Create from JSON (API) or manually copy `query` and `message` from
   `noblocks-play-production.json`.
3. Keep `env:production` in every query — staging shares the org.

## Files

| File | Purpose |
| --- | --- |
| `noblocks-play-production.json` | Fantasy worker tick / alert monitors |
