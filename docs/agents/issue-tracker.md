# Issue tracker (Jira)

Paycrest engineering issues are filed in **Jira**, not GitHub Issues.

## Target

- **Site:** [paycrest-io.atlassian.net](https://paycrest-io.atlassian.net) (cloud)
- **Project:** KAN (Engineering)
- **Repo label:** `noblocks` (required on every ticket for this repository)

## When to create an issue

Use Jira for bugs, enhancements, chores, and vertical slices. Do **not** use `gh issue create` or GitHub issue forms for new work.

**Ticket fields:** use [ticket-spec-template.md](ticket-spec-template.md). **PRs** use [.github/pull_request_template.md](../../.github/pull_request_template.md) — that is separate from the ticket spec.

Architecture or process decisions: [decision-record-template.md](decision-record-template.md).

## Issue type mapping

| Kind of work | Jira issue type |
|--------------|-----------------|
| Bug, regression, broken UX | **Bug** |
| Enhancement, chore, vertical slice | **Task** |

Use **only Bug or Task**. Never Story or Feature for new work. Keep Epic/Subtask for hierarchy only.

## How to create (agents / Claude Code skills)

Use **Atlassian MCP** tools against cloud `paycrest-io.atlassian.net`, project **KAN**.

Skills (`qa`, `triage`, `to-issues`): read this file before filing issues for noblocks.

1. Set issue type: **Bug** or **Task** (see table above) — never both shapes in one ticket.
2. Set **labels:** `noblocks` (required).
3. Title (`summary`): clear, actionable.
4. Fill **typed fields** from [ticket-spec-template.md](ticket-spec-template.md):
   - **Task:** short `description` + `customfield_10126` (User story), `10127` (Acceptance criteria), `10128` (Tech details), `10129` (Money-safety Yes/No), optional `10130` / `10131`.
   - **Bug:** `description` (describe the bug) + `customfield_10123` (To reproduce), `10124` (Expected behaviour), `environment`, optional `10125` (Additional context). **No** acceptance criteria on Bugs.
5. Pass custom fields via `additional_fields` on create/edit (e.g. `{"customfield_10126": "..."}`). Money-safety is a select — always send the option object, never a bare string: `{"customfield_10129": {"value": "Yes"}}` or `{"customfield_10129": {"value": "No"}}`.
6. Add a **flowchart in a comment** when the change involves multi-step flows or navigation.

Humans may also create tickets on the [KAN board](https://paycrest-io.atlassian.net/jira/software/projects/KAN/boards/1).

## PR ↔ Jira linking

- **Branch:** `KAN-123-short-description`
- **PR title:** `KAN-123: Short description`
- **PR description:** include  
  `Jira Issue: https://paycrest-io.atlassian.net/browse/KAN-123`

Pull requests stay on **GitHub**; only tickets live in Jira.

## References

- **KAN board:** https://paycrest-io.atlassian.net/jira/software/projects/KAN/boards/1
- Existing GitHub issues: left as-is; no backlog migration.
- GitHub Issues tab stays enabled for legacy issues; new work is filed via the Jira contact link in `.github/ISSUE_TEMPLATE/config.yml` (no submittable GitHub forms).
