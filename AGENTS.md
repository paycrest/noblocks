# Noblocks — Agent instructions

Consumer-facing crypto-to-fiat app built with Next.js. See [README.md](README.md) for setup and [docs/](docs/) for feature documentation.

## Issue tracker (Jira)

File new work in Jira project **KAN** ([paycrest-io.atlassian.net](https://paycrest-io.atlassian.net)), label **`repo-noblocks`**. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) for issue types, Atlassian MCP usage, and PR linking.

Do **not** use `gh issue create` or GitHub Issues for new tickets.

## GitHub PRs

Use [.github/pull_request_template.md](.github/pull_request_template.md). Prefix **branch** with the Jira key (e.g. `KAN-123-short-description`) and **PR title** with `KAN-123: Short description`. Include `Jira Issue: https://paycrest-io.atlassian.net/browse/KAN-123` in the description. Do not add AI attribution to PR titles or descriptions.

## Conventions

- TypeScript, Next.js App Router, Tailwind CSS, PNPM.
- Follow existing patterns in `app/`, `components/`, and `lib/`.
