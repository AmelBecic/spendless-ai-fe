# Project house rules — spendless-ai-fe

> The web client for **SpendLess AI**. Backend lives in `AmelBecic/spendless-ai-be`
> (local: `../spendless-ai`). These rules mirror the backend's; where they differ, it is
> deliberate and noted.

## What this client is

The UI for a *grounded personal-finance profiling agent* — not a budget tracker. Users log fixed
monthly expenses and daily spending; the backend maintains an evolving per-user profile and emits
**cited** savings suggestions. The differentiating screen is the suggestions feed, where every
claim is shown next to the stat it rests on.

## Workflow (non-negotiable)
- **Never commit directly to `main`.** Every change: feature branch → PR → review → merge.
- Branch names: `feat/TICKET-desc`, `fix/TICKET-desc`, `chore/desc`.
- Run the **AI code reviewer** on the PR before merging.
- Ticket keys are `SLAI-*` — the **same** Jira project as the backend, scoped by the `frontend`
  label. Sprint 3 is epic **SLAI-22** (tickets SLAI-24 → 28).

## Security
- **No secrets in the repo, ever.** Real values go in `.env.local` (git-ignored). Document required
  keys in `.env.example`.
- Only `NEXT_PUBLIC_*` vars reach the browser — never put a service-role key or the Anthropic key
  behind that prefix. This client talks to our API; it never calls Anthropic directly.
- The **pre-commit hook** runs `gitleaks`. Do not bypass hooks (`--no-verify`) without a stated reason.

## Quality gates (run before pushing)
- `npm run lint` · `npm run typecheck` · `npm run test`
- CI enforces the same gates on every PR.

## Conventions
- TypeScript (strict, ESM), Next.js, small focused modules.
- Match existing code style; keep comment density consistent with surrounding code.
- Prefer clarity over cleverness.
- **Commit messages carry no AI/co-author attribution** — no `Co-Authored-By`, no "Generated with"
  line. Enforced by the `commit-msg` hook.

## Client invariants (the ones that bite)

These are not style preferences. Each maps to a failure the backend design already prevents.

1. **Money is integer cents, everywhere.** Cents in component state, cents on the wire. The currency
   input parses to cents exactly once, at the edge; formatting happens only at render. **No
   `parseFloat` on an amount may reach state or the API.** A free-text money input is exactly where
   float arithmetic comes back.
2. **The client performs no money arithmetic.** Every total, share, percentage and delta is rendered
   verbatim from the API. Computing one locally creates a second source of truth for a number the
   agent is citing.
3. **No `fetch` in components.** All requests go through `src/api/client.ts`, which attaches the
   Supabase access token and parses the error envelope.
4. **All wire types live in `src/api/contract.ts`** — hand-copied from the backend's `src/routes/*.ts`
   with the source commit SHA in the file header. Declared nowhere else. See below.
5. **Ungrounded must look ungrounded.** A suggestion whose citation cannot be resolved renders as
   visibly degraded, never identically to a grounded one.

## The copied contract

The backend exports its response interfaces (`StatsResponse`, `ProfileResponse`,
`SuggestionsResponse`, …) from each route module. We **copy** them rather than installing the
backend as a dependency: its `postinstall` runs `prisma generate`, which would drag Prisma and the
whole backend dep tree into a frontend install.

The accepted cost is **silent drift**. The mitigation is the recorded SHA — when backend response
types change, re-diff `contract.ts` against that SHA. This is a checklist item, not an automated
check; treat it as load-bearing.

## Backend API surface

`GET /health` · `GET /categories` · `GET|POST|PATCH|DELETE /transactions` ·
`GET|POST|PATCH|DELETE /fixed-expenses` · `GET /stats?from=&to=` · `GET /profile` ·
`POST /profile/refresh` · `GET /suggestions` · `PATCH /suggestions/:id` · `POST /suggestions/refresh`

All except `/health` require a Supabase JWT. Errors come back as `{ error: { code, message } }`.
The two `refresh` routes are LLM-backed, share one per-user rate budget, and return **429 with
`Retry-After`** when exceeded — surface that as a real message, not a generic failure.

## Standing caveat — the agent is stub-proven only

No `ANTHROPIC_API_KEY` has ever been used against the live API. Every agent path in the backend was
built and tested against a scripted stub that conforms to the response schema by construction, and
the eval numbers currently published measure *the backend's code*, not the model's output. The
structured-output and prompt-caching contracts are **unverified against the real API**.

Practically: if a profile or suggestion response looks wrong during development, the backend's live
model path is an untested suspect, not a ruled-out one. The live eval run is Sprint 4.

## Tooling
- Serena MCP is configured for the backend repo, not this one. Add it here if code navigation gets
  painful: `claude mcp add serena` (config is local-scope, so it is not checked in).
