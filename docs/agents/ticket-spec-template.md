# Ticket / Spec template (Jira KAN)

Copy this into the **Jira ticket description** when creating work for the noblocks repo. The ticket is the single source of truth — no spec, no build. Add a **flowchart in a Jira comment** when the change touches multi-step wallet or swap flows.

**Label:** `noblocks` (required)

---

## User Story

Add the details of this issue from the user's POV.

---

## Acceptance Criteria

Include at least one **failure-case** scenario, not only the happy path.

1. **GIVEN** …
   **WHEN** …
   **THEN** …

2. **GIVEN** … (failure / edge case)
   **WHEN** …
   **THEN** …

---

## Tech Details

- Next.js App Router pages / layouts / API routes affected
- Wallet connection, signing, or chain-switch flows
- Env vars, Privy/wallet config, or aggregator API integration
- Database migrations (expand/contract if applicable)

---

## Money-safety

- Touches swap, send, quote, or balance flows that move user funds? **Yes / No**
- If **Yes**: second human reviewer required before prod; call out failure cases in acceptance criteria.
- UI-only, analytics, or non-transactional changes: usually **No**.

---

## Notes / Assumptions

- Assumptions that must stay true for this change to remain correct.

---

## Open Questions

- …

---

## Bug tickets (shorter variant)

For **Bug** issue type, use at minimum:

**Describe the bug** — what is wrong (failed swap, wrong quote, etc.).

**To reproduce** — URL, wallet, chain, steps.

**Expected** — correct behavior.

**Environment** — staging vs production, browser, network.

**Acceptance criteria** — **GIVEN / WHEN / THEN** for the fix, including one regression check.
