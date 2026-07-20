---
name: ticket
description: Run one Jira ticket end-to-end — pick it up, branch, implement against the acceptance criteria, verify, gate, PR, run the AI code reviewer, and update Jira. Use when the user says "/ticket", "take the next ticket", "work <KEY>-24", "start the next story", or asks to pick up / work / drive a ticket through to review.
---

# Run a ticket end-to-end

One invocation carries a ticket from `To Do` to `In Review` with a reviewed PR open. The user
should not have to say "now branch", "now review it", or "now update Jira" — those are steps here,
not requests.

**Argument:** a ticket key (`/ticket SLAI-24`) or nothing (`/ticket` → take the next one).

## Step 0 — Load the repo's config (always first)

Read **`.claude/project.json`** in the repo root. It provides every project-specific value below:

- `jiraKey` — the Jira project key (`SLAI`).
- `cloudId` — Atlassian cloudId for the MCP calls.
- `boardId` — the board.
- `ticketFilterJql` — an extra JQL fragment ANDed into the pick queries so this repo owns only its
  own slice. Here it is `labels = frontend`. **This matters more than usual:** one Jira project
  (`SLAI`) drives both repos, and the backend's tickets are one label away. Never pick up a
  `backend` ticket from this repo.
- `reviewerPath` — where the AI code reviewer lives.
- `assigneeAccountId` — the human this work is assigned to.
- `transitions` — status transition IDs (`todo`/`inProgress`/`inReview`/`done`). **Verify them once**
  against `getTransitionsForJiraIssue` on a real ticket if the loop ever fails to transition.

If `.claude/project.json` is missing or still has `FIXME` values, **stop and ask** — the loop can't
run without it.

## Step 1 — Reconcile drift (before anything else)

Statuses lie when the loop half-ran. Query:

```
project = SLAI AND status = "In Review" AND labels = frontend
```

For each hit, check its PR (`gh pr list --search "<TICKET>" --state all`). **If the PR is MERGED,
transition the ticket to Done** and move on. This is a known recurring gap. Report what you reconciled.

## Step 2 — Preflight

- `git status --short` must be clean. If not, **stop and ask** — never stash or discard.
- `git checkout main && git pull`. Delete merged local branches if they clutter.
- If the working tree is mid-ticket on a feature branch, ask before abandoning it.

## Step 3 — Pick the ticket

Given a key, use it — but **check its label is `frontend`** before starting. Otherwise:

```
project = SLAI AND status = "To Do" AND issuetype != Epic AND labels = frontend ORDER BY key ASC
```

Take the lowest key. **Respect `Depends on`** — frontend tickets state it in the first line of the
description (e.g. _"Depends on: SLAI-23, SLAI-24"_), and dependencies may live in the **backend**
repo. If a dependency isn't `Done`, skip to the next eligible ticket and say why. Never take an
Epic (SLAI-22 is the sprint epic). If nothing is eligible, say so and stop. Don't invent work.

## Step 4 — Read the requirements

Get the ticket with `getJiraIssue`. **There is no `docs/backlog.md` in this repo** — unlike the
backend, the acceptance criteria live in full in the Jira description, under `## Acceptance
criteria`, often followed by a `## Note` that explains _why_ a criterion is load-bearing. Read the
note; it is usually the criterion the reviewer will press on.

**The AC is the spec** — re-read it before writing code and again before opening the PR. If it is
ambiguous or looks wrong, **stop and ask**; a misread AC costs a whole loop.

## Step 5 — Start

- **Assign to `assigneeAccountId`** — every ticket, every time.
- Transition to **In Progress**.
- Branch: `feat/SLAI-<n>-<short-desc>` (`fix/` for Bug, `chore/` for chore-labelled).

## Step 6 — Build

Follow **`CLAUDE.md`** and match existing patterns. Work through the AC bullet by bullet — every
bullet must be satisfiable by something you can point at in the diff.

The client invariants in `CLAUDE.md` are AC in disguise; several tickets restate them. Before you
call a bullet done, check the diff against all five:

1. Money is **integer cents** everywhere — no `parseFloat` on an amount reaches state or the API.
2. The client performs **no money arithmetic** — every figure rendered verbatim from the API.
3. **No `fetch` in components** — everything through `src/api/client.ts`.
4. **All wire types in `src/api/contract.ts`**, declared nowhere else. If backend response types
   moved, re-diff against the SHA in that file's header and update it.
5. **Ungrounded must look ungrounded** — a suggestion with an unresolvable citation renders visibly
   degraded.

## Step 7 — Verify it actually works

Drive the app via the **`run`** skill and exercise the behaviour the AC describes. Tests passing is
not verification — for a UI ticket, look at the screen.

If a profile or suggestion response looks wrong, remember the standing caveat: the backend's live
model path is **stub-proven only** and is an untested suspect, not a ruled-out one. Don't burn the
loop building client-side workarounds for what may be a backend bug — report it.

## Step 8 — Self-review against the checklist (before you spend a reviewer run)

Go through **`docs/engineering-checklist.md`** and fix everything you can find yourself. _(It lands
in SLAI-24, ported from the backend — until then, use `CLAUDE.md`'s invariants and security rules as
the checklist.)_ The AI reviewer is an expensive backstop, not your first-pass QA. Every avoidable
finding is a wasted review round.

## Step 9 — Gates

`npm run lint && npm run typecheck && npm run test`. **All must pass before committing.** Never
`--no-verify` — the pre-commit hook runs `gitleaks` and the commit-msg hook rejects AI/co-author
trailers, so **commit messages carry no attribution line**.

**After any dependency change**, clean-regen the lockfile before committing
(`rm -rf node_modules package-lock.json && npm install`) or CI `npm ci` will fail on dropped
cross-platform optional deps.

## Step 10 — Commit & PR

- Commit: `feat: SLAI-<n> <what changed>` (or `fix:` / `docs:` / `chore:`). No `Co-Authored-By`.
- Push, then `gh pr create` against `AmelBecic/spendless-ai-fe`.
- **PR title must start with `SLAI-<n>`** (the `pr-title` CI check fails otherwise).
- PR body: what changed, and the AC as a checklist so the reviewer can check fulfilment.

## Step 11 — Review (do not skip, do not ask permission)

**Before running it, confirm GitHub has your latest commit** — reviewing a stale diff produces
phantom findings and wastes a whole run:
`[ "$(gh pr view <n> --json headRefOid -q .headRefOid)" = "$(git rev-parse HEAD)" ]`.

```bash
cd <reviewerPath>
npm run review -- --pr <pr-url> --post
```

The reviewer reads Jira live from its own `.env` — **never** pass `--jira`. Then **triage the
findings yourself**:

- Real bugs / AC misses → fix them. **Batch all fixes into one push**, then re-review **at most once**
  to confirm — do not re-run the reviewer after each individual fix (each run costs real budget).
- Disagree, or it's a low/nit you're deferring → say so explicitly with a reason. Don't silently ignore.
- Reviewer approving its own author's PR degrades to COMMENT — expected, not a failure.
- If findings keep coming in successive rounds, they were predictable — feed them back into
  `docs/engineering-checklist.md` so Step 8 catches them next time.

## Step 12 — Hand back

- Transition to **In Review**.
- Comment on the ticket with the PR link + the review verdict (`addCommentToJiraIssue`).
- **Stop here.** Merging is the human's call — report and wait.

Then tell the user, in plain prose: ticket, what you built, the review verdict, anything you pushed
back on, and the PR link. Not a wall of tool output.

## After they merge

Transition to **Done**. If they say "merge it" and you merge, do this immediately — that's the drift
step 1 exists to clean up.

## Failure rules

- Gates fail → fix and retry. Twice failing the same way → stop and report.
- Never leave a ticket `In Progress` with no branch, an in-flight ticket unassigned, or a merged PR
  not `Done`.
- Anything hard to reverse (force-push, merge, closing a PR, touching `main`) → ask first.
