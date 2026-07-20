# SpendLess AI — Web client

The Next.js client for **SpendLess AI**, a grounded personal-finance profiling agent.

You log fixed monthly expenses and daily spending. The backend maintains an evolving per-user
profile through an incremental summarization loop, and emits savings suggestions that **cite the
stat each one rests on**. Numbers are always computed in code — the model interprets, it never does
arithmetic.

> **Status: scaffolded, no screens yet.** The toolchain, git hooks, CI and the copied API contract
> are in place (SLAI-24). The screens land over the rest of Sprint 3 — auth first (**SLAI-25**),
> which everything else depends on.

## Repos

|                             |                                                                             |
| --------------------------- | --------------------------------------------------------------------------- |
| Backend (API, agent, evals) | [`AmelBecic/spendless-ai-be`](https://github.com/AmelBecic/spendless-ai-be) |
| Frontend (this repo)        | [`AmelBecic/spendless-ai-fe`](https://github.com/AmelBecic/spendless-ai-fe) |

Both are tracked in the same Jira project (`SLAI`), scoped by the `backend` / `frontend` labels.
Sprint 3 is epic **SLAI-22**.

## Planned screens

- **Auth** — login/signup against Supabase Auth _(SLAI-25)_
- **Log spend** — daily transactions and fixed expenses _(SLAI-26)_
- **Dashboard** — spend stats plus the profile narrative _(SLAI-27)_
- **Suggestions feed** — cited suggestions with dismiss/apply _(SLAI-28)_

## Architecture notes

**Wire types are hand-copied.** `src/api/contract.ts` holds every request and response interface,
copied from the backend's `src/domain/types.ts`, `src/http/errors.ts` and `src/routes/*.ts` with the
source commit SHA in its header. We don't install the backend as a dependency because its
`postinstall` runs `prisma generate`, which would pull Prisma and the whole backend dep tree into a
frontend install. The cost is drift; the SHA is how we catch it — re-diff against it whenever backend
response types change (`docs/engineering-checklist.md`). `contract.test.ts` keeps the header honest
and asserts no wire type is declared anywhere else.

**Money is integer cents end to end.** Cents in state, cents on the wire, formatting only at render.
The client performs no money arithmetic — every figure is rendered verbatim from the API.

## Caveat: the agent is stub-proven only

No `ANTHROPIC_API_KEY` has been used against the live Anthropic API yet. The backend's agent paths
were built and tested against a scripted stub, and the published eval numbers measure the backend's
code rather than the model's output. The structured-output and prompt-caching contracts are
unverified against the real API. If agent responses look wrong during development, that path is an
untested suspect. The live eval run is scheduled for Sprint 4.

## Getting started

Requires Node >= 24.

```bash
npm install
cp .env.example .env.local   # then fill in the Supabase values
npm run dev                  # http://localhost:3000
```

`npm install` wires up the git hooks for you via the `prepare` script — gitleaks pre-commit, plus the
commit-msg hook that strips AI/co-author trailers. If they ever seem inactive, re-point them by hand:

```bash
git config core.hooksPath .githooks
```

### Scripts

|                                       |                                         |
| ------------------------------------- | --------------------------------------- |
| `npm run dev`                         | Next dev server                         |
| `npm run build` · `start`             | production build / serve                |
| `npm run lint` · `typecheck` · `test` | the three gates CI enforces on every PR |
| `npm run format`                      | Prettier                                |
| `npm run secrets`                     | gitleaks scan                           |

Only `NEXT_PUBLIC_*` variables reach the browser, and everything under that prefix is public — the
Supabase service-role key and `ANTHROPIC_API_KEY` belong to the backend and must never appear here.
See `.env.example`.
