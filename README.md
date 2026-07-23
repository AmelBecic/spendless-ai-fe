# SpendLess AI — Web client

A **grounded personal-finance profiling agent** — not a budget tracker, and not a chatbot.

You log fixed monthly expenses and daily spending. A backend agent maintains an evolving per-user
profile through an incremental day-by-day summarization loop, then emits savings suggestions that
**show the stat each one rests on, right next to the claim**. Every number is computed in code — the
model interprets and advises, it never does the arithmetic. Suggestion quality is measured by an
eval harness.

> **Live demo:** _coming soon_ &nbsp;·&nbsp; **Eval baseline:** _first live run pending (see below)_

<!-- Add docs/screenshots/*.png — see docs/screenshots/CAPTURE.md for the exact shots. -->

![The suggestions feed — each suggestion shown next to the stat it cites](docs/screenshots/suggestions.png)

## What makes it different

- **Grounded, not generative.** Each suggestion is rendered beside the category or stat it cites. A
  suggestion whose citation can't be resolved is shown **visibly degraded** — never dressed up as if
  it were backed by data.
- **A determinism boundary.** All figures (totals, shares, month-over-month deltas, estimated
  savings) come from the backend, computed in pure code. The client performs no money arithmetic;
  the model never sees a "please add these up".
- **Measured, not vibes.** The backend ships an LLM-as-judge eval harness so suggestion quality is a
  number, not an impression.
- **Runs without a model key.** AI is an opt-in capability (see below), so the whole expense-tracking
  product works with no `ANTHROPIC_API_KEY` configured at all.

## Screens

|                                                |                                                         |
| ---------------------------------------------- | ------------------------------------------------------- |
| ![Overview](docs/screenshots/overview.png)     | ![Log spending](docs/screenshots/log.png)               |
| **Overview** — the hub, on the app shell       | **Log** — daily spend & fixed expenses                  |
| ![Dashboard](docs/screenshots/dashboard.png)   | ![Suggestions](docs/screenshots/suggestions-detail.png) |
| **Dashboard** — stat tiles + the "money story" | **Suggestions** — grounded (teal) vs degraded (amber)   |

## No-AI mode

AI is gated by **two independent switches**, and runs only when both are on:

1. **Server capability** — is an `ANTHROPIC_API_KEY` configured? The backend advertises this at
   `GET /capabilities`.
2. **User preference** — an in-app **AI mode** toggle (off by default), stored per browser.

With AI off, every money feature works as a full expense tracker; the profile narrative and the
suggestions feed simply aren't offered, and the toggle hides itself entirely when the server has no
key. A missing key is a supported mode, not a broken deploy.

## Architecture

This is the web client. The API, agent and evals live in the backend repo:

|                             |                                                                             |
| --------------------------- | --------------------------------------------------------------------------- |
| Backend (API, agent, evals) | [`AmelBecic/spendless-ai-be`](https://github.com/AmelBecic/spendless-ai-be) |
| Frontend (this repo)        | [`AmelBecic/spendless-ai-fe`](https://github.com/AmelBecic/spendless-ai-fe) |

**Money is integer cents, end to end.** Cents in component state, cents on the wire; a currency
input parses to cents exactly once at the edge, and formatting happens only at render. No
`parseFloat` on an amount ever reaches state or the API.

**Wire types are hand-copied, deliberately.** `src/api/contract.ts` holds every request/response
interface, copied from the backend's `src/domain/types.ts`, `src/http/errors.ts` and
`src/routes/*.ts` with the **source commit SHA** in its header. Installing the backend as a
dependency would drag Prisma and its whole tree into a frontend install (its `postinstall` runs
`prisma generate`), so we copy instead. The accepted cost is drift; the recorded SHA is the
mitigation — re-diff against it when backend response types change. `contract.test.ts` keeps the
header honest and asserts no wire type is declared anywhere else.

**No `fetch` in components.** Every request goes through `src/api/client.ts`, which attaches the
Supabase access token, parses the backend's `{ error: { code, message } }` envelope into a typed
error components branch on, and turns a 429's `Retry-After` into a real wait message.

## Design system

Warm consumer-finance: a warm paper ground, rounded cards, soft shadows, and two accents that carry
meaning — **teal** for what you keep (savings, grounded citations) and **coral** for what to watch.
Built on **Tailwind v4** with shadcn-style primitives; full light and dark, the viewer's theme
toggle winning over the OS preference.

## Tech stack

Next.js 16 · React 19 · TypeScript (strict, ESM) · Tailwind v4 + shadcn/ui · Supabase Auth ·
Vitest + Testing Library.

## Getting started

Requires Node >= 24.

```bash
npm install
cp .env.example .env.local   # fill in the Supabase values + the API base URL
npm run dev                  # http://localhost:3000
```

Quality gates (also enforced in CI): `npm run lint` · `npm run typecheck` · `npm run test`.

## Status

The full product is built and redesigned: auth, logging, dashboard and the grounded suggestions
feed, all on the design system. Next up is deployment (Dockerized backend → Railway, this client →
Vercel) and the **first live model run**, which produces the eval baseline quoted at the top of this
README. Until that run lands, the agent paths are proven against a scripted stub that conforms to the
response schema — so the published eval numbers measure the backend's code, and the live
structured-output / prompt-caching behavior is verified at deploy time, not before.
