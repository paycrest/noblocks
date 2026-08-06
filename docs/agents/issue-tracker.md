# Issue tracker (Jira)

Paycrest engineering issues are filed in **Jira**, not GitHub Issues.

## Target

- **Site:** [paycrest-io.atlassian.net](https://paycrest-io.atlassian.net) (cloud)
- **Project:** KAN (Engineering)
- **Repo label:** `repo-noblocks` (required on every ticket for this repository)

## When to create an issue

Use Jira for bugs, enhancements, chores, and vertical slices. Do **not** use `gh issue create` or GitHub issue forms for new work.

## Issue type mapping

| Kind of work | Jira issue type |
|--------------|-----------------|
| Bug, regression, broken UX | **Bug** |
| Enhancement, chore, vertical slice | **Task** |

No Story/Epic usage for now.

## How to create (agents / Claude Code skills)

Use **Atlassian MCP** tools against cloud `paycrest-io.atlassian.net`, project **KAN**.

Skills (`qa`, `triage`, `to-issues`): read this file before filing issues for noblocks.

1. Set issue type: **Bug** or **Task** (see table above).
2. Set **labels:** `repo-noblocks` (required).
3. Title: clear, actionable summary.
4. Description: context, steps to reproduce (bugs), acceptance criteria (tasks).

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
- GitHub Issues tab stays enabled; templates redirect to Jira.
