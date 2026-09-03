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
5. Put custom fields in the tool's field bag: `additional_fields` on `createJiraIssue`, `fields` on `editJiraIssue`.
6. **Format the values** — see [Field formats (ADF)](#field-formats-adf). Rich text must be an ADF document, not Markdown; Money-safety must be an option object.
7. Add a **flowchart in a comment** when the change involves multi-step flows or navigation.

Humans may also create tickets on the [KAN board](https://paycrest-io.atlassian.net/jira/software/projects/KAN/boards/1).

## Field formats (ADF)

`description`, `environment` and **every** `customfield_101xx` above are **rich-text (ADF) fields**. Money-safety (`customfield_10129`) is a select. Only `summary` and `labels` take plain values.

**Rich text — send ADF, never Markdown.** Set `contentFormat: "adf"` and pass a document object:

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    { "type": "paragraph", "content": [{ "type": "text", "text": "Plain sentence." }] },
    {
      "type": "bulletList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [{ "type": "text", "text": "Emphasised bit", "marks": [{ "type": "strong" }] }]
            }
          ]
        }
      ]
    }
  ]
}
```

- A Markdown or plain string in a rich-text custom field is either **rejected** (`Operation value must be an Atlassian Document (see the Atlassian Document Format)`) or **stored verbatim** — the ticket then shows literal `**bold**`, `- bullets`, `1.` steps and code fences instead of formatting. This is not cosmetic — it is what forced a full re-backfill of existing KAN tickets.
- Markdown is auto-converted **only** for a tool's own `description` parameter under `contentFormat: "markdown"`. Values inside `additional_fields` / `fields` are **never** converted.
- Use real ADF nodes instead of Markdown syntax: `bulletList` / `orderedList` + `listItem` for lists, `codeBlock` for code, `heading` for headings, `hardBreak` for line breaks, `marks: [{"type": "strong"}]` for bold, `marks: [{"type": "link", "attrs": {"href": "..."}}]` for links.
- **Money-safety** is the one non-text field — send the option object, never a bare string: `{"customfield_10129": {"value": "Yes"}}` or `{"customfield_10129": {"value": "No"}}`.
- After writing, read the issue back (`responseContentFormat: "markdown"`) and confirm the field renders as formatted text rather than raw markers.

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
