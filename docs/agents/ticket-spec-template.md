# Ticket / Spec template (Jira KAN)

Fill **typed Jira fields** (not one markdown dump in Description). The ticket is the single source of truth — no spec, no build. Add a **flowchart in a Jira comment** when the change involves multi-step flows or navigation.

**Label:** `noblocks` (required)

**Choose exactly one issue type.** Do **not** mix Bug fields with Task fields. Do **not** use Story or Feature.

**Field format:** every field below except `summary` and Money-safety is **rich text (ADF)** — send `contentFormat: "adf"` with a `{"type": "doc", ...}` object. Markdown strings are rejected or stored literally, so `**bold**` and list markers end up visible in the ticket. See [issue-tracker.md](issue-tracker.md#field-formats-adf).

| Jira issue type | Use this section |
|-----------------|------------------|
| **Task** (enhancement, chore, vertical slice) | [Task](#task) |
| **Bug** (regression, broken UX) | [Bug](#bug) |

---

## Task

Use for issue type **Task** only. Set fields via Atlassian MCP — `additional_fields` on create, `fields` on edit — with `contentFormat: "adf"` for every rich-text value.

| Field | Jira field id | Required |
|-------|---------------|----------|
| Summary (title) | `summary` | yes |
| Description (short overview only) | `description` | no |
| User story | `customfield_10126` | yes |
| Acceptance criteria | `customfield_10127` | yes |
| Tech details | `customfield_10128` | yes |
| Money-safety | `customfield_10129` (select: `{"value": "Yes"}` / `{"value": "No"}`) | yes |
| Notes / assumptions | `customfield_10130` | no |
| Open questions | `customfield_10131` | no |

### Description

Short what/why overview only. Full user POV goes in **User story**.

### User story (`customfield_10126`)

Add the details of this issue from the user's POV.

### Acceptance criteria (`customfield_10127`)

Include at least one **failure-case** scenario, not only the happy path.

1. **GIVEN** …
   **WHEN** …
   **THEN** …

2. **GIVEN** … (failure / edge case)
   **WHEN** …
   **THEN** …

### Tech details (`customfield_10128`)

- Next.js App Router pages / layouts / API routes affected
- Wallet connection, signing, or chain-switch flows
- Env vars, Privy/wallet config, or aggregator API integration
- Database migrations (expand/contract if applicable)


### Money-safety (`customfield_10129`)

- Touches swap, send, quote, or balance flows that move user funds? **Yes / No**
- If **Yes**: second human reviewer required before prod; call out failure cases in acceptance criteria.
- UI-only, analytics, or non-transactional changes: usually **No**.


### Notes / assumptions (`customfield_10130`)

- Assumptions that must stay true for this change to remain correct.

### Open questions (`customfield_10131`)

- …

---

## Bug

Use for issue type **Bug** only. Do **not** set Task fields (no User story, Acceptance criteria, Tech details, Money-safety, Notes, or Open questions). Put money-safety notes under **Expected behaviour** when relevant.

| Field | Jira field id | Required |
|-------|---------------|----------|
| Summary (title) | `summary` | yes |
| Description (describe the bug) | `description` | no |
| To reproduce | `customfield_10123` | yes |
| Expected behaviour | `customfield_10124` | yes |
| Environment | `environment` | yes |
| Additional context | `customfield_10125` | no |

### Description

What is wrong. Include enough technical context for an engineer to start.

### To reproduce (`customfield_10123`)

Steps, IDs, URL, wallet/account, chain (if relevant).

### Expected behaviour (`customfield_10124`)

Correct behavior. If the bug is on a money-moving path, state **Money-safety: Yes** (second human reviewer before prod) here.

### Environment (`environment`)

Staging vs production, browser, network, currency, host (as applicable).

### Additional context (`customfield_10125`)

Logs, links, screenshots notes, or other context.
