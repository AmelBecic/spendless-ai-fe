# SpendLess AI — Web client

The Next.js client for **SpendLess AI**, a grounded personal-finance profiling agent.

You log fixed monthly expenses and daily spending. The backend maintains an evolving per-user
profile through an incremental summarization loop, and emits savings suggestions that **cite the
stat each one rests on**. Numbers are always computed in code — the model interprets, it never does
arithmetic.

> **Status: scaffolding.** This repo currently holds only its house rules and ignore list. The
> toolchain, hooks, CI and API contract land in **SLAI-24**.

## Repos

| | |
|---|---|
| Backend (API, agent, evals) | [`AmelBecic/spendless-ai-be`](https://github.com/AmelBecic/spendless-ai-be) |
| Frontend (this repo) | [`AmelBecic/spendless-ai-fe`](https://github.com/AmelBecic/spendless-ai-fe) |

Both are tracked in the same Jira project (`SLAI`), scoped by the `backend` / `frontend` labels.
Sprint 3 is epic **SLAI-22**.

## Planned screens

- **Auth** — login/signup against Supabase Auth *(SLAI-25)*
- **Log spend** — daily transactions and fixed expenses *(SLAI-26)*
- **Dashboard** — spend stats plus the profile narrative *(SLAI-27)*
- **Suggestions feed** — cited suggestions with dismiss/apply *(SLAI-28)*

## Architecture notes

**Wire types are hand-copied.** `src/api/contract.ts` will hold every response interface, copied
from the backend's `src/routes/*.ts` with the source commit SHA in its header. We don't install the
backend as a dependency because its `postinstall` runs `prisma generate`, which would pull Prisma
and the whole backend dep tree into a frontend install. The cost is drift; the SHA is how we catch it.

**Money is integer cents end to end.** Cents in state, cents on the wire, formatting only at render.
The client performs no money arithmetic — every figure is rendered verbatim from the API.

## Caveat: the agent is stub-proven only

No `ANTHROPIC_API_KEY` has been used against the live Anthropic API yet. The backend's agent paths
were built and tested against a scripted stub, and the published eval numbers measure the backend's
code rather than the model's output. The structured-output and prompt-caching contracts are
unverified against the real API. If agent responses look wrong during development, that path is an
untested suspect. The live eval run is scheduled for Sprint 4.

## Getting started

Nothing to run yet — see SLAI-24. Local setup, env keys and scripts get documented here as they land.
