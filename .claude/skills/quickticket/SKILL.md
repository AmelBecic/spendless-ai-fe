---
name: quickticket
description: Run one small Jira ticket end-to-end in fast mode — branch, implement, gate, self-review the diff, PR, update Jira — with no AI code reviewer run. Use when the user says "/quickticket", "quick run <KEY>", "small ticket, skip the reviewer", or wants a ticket driven to In Review without spending a reviewer run.
---

# Run a ticket, fast

Same loop as **`/ticket`**, minus the expensive backstop. The AI code reviewer is not run; instead
you review your own diff carefully **before** pushing, and the PR goes up ready for a human.

Use this for tickets the user has judged small: copy changes, config, docs, a contained component,
a test fix. **If the ticket turns out not to be small** — it touches money handling, auth, the API
client, `contract.ts`, or spans more than a few files — say so and recommend `/ticket` instead
rather than quietly skipping the reviewer on risky code.

**Argument:** a ticket key (`/quickticket SLAI-26`) or nothing (take the next eligible one).

## Step 0 — Config

Read **`.claude/project.json`**: `cloudId`, `boardId`, `assigneeAccountId`, `transitions`, and
`ticketFilterJql` (`labels = frontend`). One Jira project drives both repos — **never pick up a
`backend`-labelled ticket from here**. Missing or `FIXME` values → stop and ask.

`reviewerPath` is unused in this skill. Ignore it.

Skip the In-Review drift reconciliation that `/ticket` does at its Step 1 — that housekeeping
belongs to the full loop.

## Step 1 — Preflight and pick

- `git status --short` must be clean. If not, **stop and ask** — never stash or discard.
- `git checkout main && git pull`.
- Given a key, verify its label is `frontend`. Otherwise:

```
project = SLAI AND status = "To Do" AND issuetype != Epic AND labels = frontend ORDER BY key ASC
```

Take the lowest key. **Respect `Depends on`** (first line of the description; dependencies may live
in the backend repo) — if a dependency isn't `Done`, skip it and say why. Never take an Epic. If
nothing is eligible, say so and stop.

## Step 2 — Read the AC, then start

`getJiraIssue`. Acceptance criteria live in full in the Jira description under `## Acceptance
criteria`, often with a `## Note` explaining why a criterion is load-bearing — read it. **The AC is
the spec.** Ambiguous or wrong-looking → stop and ask.

Then: assign to `assigneeAccountId`, transition to **In Progress**, branch
`feat/SLAI-<n>-<short-desc>` (`fix/` for Bug, `chore/` for chore-labelled).

## Step 3 — Build

Follow **`CLAUDE.md`** and match existing patterns. Work the AC bullet by bullet; every bullet must
be satisfiable by something you can point at in the diff.

## Step 4 — Review your own diff (this replaces the reviewer)

Read `git diff main...HEAD` end to end — not the files you remember writing, the actual diff. Check:

- **`docs/engineering-checklist.md`** — the whole list.
- The five client invariants in `CLAUDE.md`: integer cents everywhere (no `parseFloat` on an amount
  reaching state or the API); no money arithmetic in the client; no `fetch` in components; wire
  types only in `src/api/contract.ts`; ungrounded suggestions render visibly degraded.
- Every AC bullet, re-read against the diff.
- Secrets: nothing real committed, only `NEXT_PUBLIC_*` reaches the browser.

Fix what you find here. Anything you consciously leave, note it in the PR body so the human sees it.

## Step 5 — Verify and gate

If the ticket changes something visible, drive the app via the **`run`** skill and look at it. For
non-visual tickets, tests are enough.

`npm run lint && npm run typecheck && npm run test` — **all must pass before committing**. Never
`--no-verify`; the pre-commit hook runs `gitleaks` and commit-msg rejects AI/co-author trailers, so
**commit messages carry no attribution line**.

After any dependency change, clean-regen the lockfile before committing
(`rm -rf node_modules package-lock.json && npm install`) or CI `npm ci` fails.

## Step 6 — PR and hand back

- Commit `feat: SLAI-<n> <what changed>` (or `fix:` / `docs:` / `chore:`).
- Push, `gh pr create` against `AmelBecic/spendless-ai-fe`. **Title must start with `SLAI-<n>`**
  (the `pr-title` CI check fails otherwise).
- PR body: what changed, the AC as a checklist, and a line stating the AI reviewer was **not** run
  on this PR — the human needs to know which backstop is missing.
- Transition to **In Review**, comment the PR link on the ticket.
- **Stop.** Merging is the human's call.

Report in plain prose: ticket, what you built, gate results, anything you left unfixed, PR link.

## Failure rules

- Gates fail → fix and retry. Twice failing the same way → stop and report.
- Never leave a ticket `In Progress` with no branch, or an in-flight ticket unassigned.
- Anything hard to reverse (force-push, merge, closing a PR, touching `main`) → ask first.
- After they merge, transition to **Done**.
