# Pre-PR engineering checklist — web client

Self-review against this **before opening a PR and before running the AI reviewer**. The reviewer is
a backstop, not your first-pass QA — each run costs real budget, so catch the predictable things here
first. This list grows every time the reviewer catches something that could have been caught up front.

Ported from the backend's `docs/engineering-checklist.md`. Items whose failure mode is server-side
only — Prisma migrations, RLS, connection pooling, the in-process rate limiter's eviction policy —
were **deliberately left there rather than copied here**; when you touch the backend, read that file,
not this one. What survives the port is everything a client can still get wrong, plus the sections
below that only a client can.

## The contract with the backend

- [ ] **Re-diff the copied contract when backend response types change.** `src/api/contract.ts`
      records the backend commit it was copied from; drift is silent by construction, and the SHA is
      the only mitigation:
      `git -C ../spendless-ai diff <SHA>..main -- src/domain/types.ts src/http/errors.ts src/routes/`
      Update the types **and the SHA in the same commit** — a stale SHA reads as "checked" when
      nothing was, which is worse than no SHA at all.
- [ ] **No wire type is declared outside `contract.ts`.** A component that declares its own
      `StatsResponse` compiles, renders, and drifts independently of the recorded SHA — the one
      mitigation stops covering it with nothing going red. (`contract.test.ts` pins this.)
- [ ] **The Jira AC is not the contract; the backend source is.** Where they disagree, the code the
      API actually returns wins — say so in the PR rather than coding to the ticket. (SLAI-24:
      SLAI-28's AC names `estMonthlySavingsCents`; the field is and always was
      `estMonthlySavings: Money`.)

## The five client invariants (CLAUDE.md)

- [ ] **Money is integer cents everywhere** — component state and wire alike. The currency input
      parses to cents **exactly once**, at the edge; formatting happens only at render. No
      `parseFloat` on an amount reaches state or the API. A free-text money input is precisely where
      float arithmetic comes back.
- [ ] **The client performs no money arithmetic.** Every total, share, percentage and delta is
      rendered verbatim from the API. Computing one locally creates a second source of truth for a
      number the agent is citing — and the agent is citing only one of them.
- [ ] **No `fetch` in components.** Everything through `src/api/client.ts`, which attaches the
      Supabase token and parses the error envelope. (Enforced by `no-restricted-globals` in
      `eslint.config.js` — if you find yourself adding an eslint-disable, that is the finding.)
- [ ] **Ungrounded must look ungrounded.** A suggestion whose citation cannot be resolved renders as
      visibly degraded, never identically to a grounded one. This failing silently is worse than not
      shipping the feature.
- [ ] **A figure and its citation render together.** The stat a claim rests on sits next to the
      claim — not behind a tooltip, an expander, or a hover.

## Money & formatting

- [ ] **Parse at the edge, once.** `"12.5"` → `1250`, `"12.345"` → reject (not round), `"12,50"` →
      `1250`, `""` → absent, `"-5"` → reject. Test all of them; the comma case is the one a
      dollar-locale developer never types.
- [ ] **Never `Number(cents) / 100` into state.** Divide at render, inside the formatter, or let
      `Intl.NumberFormat` take minor units — the moment a fractional value is stored, precision is
      already gone.
- [ ] **Bound the input against the backend's real limit.** `amountCents` is Postgres int4:
      `2_147_483_647` (`INT4_MAX` in `contract.ts`). Above it is a 400 — reject client-side rather
      than round-tripping to find out.
- [ ] **Currency comes from the data, not from the locale.** Formatting a EUR amount with the
      browser's `en-US` default prints a dollar sign on a euro figure.

## API client & error handling

- [ ] **One error envelope, parsed in one place.** `{ error: { code, message } }` becomes a typed
      error in `client.ts`; components branch on `code`, never on a message string.
- [ ] **429 from the two refresh routes surfaces `Retry-After` as a real message.** Both are
      LLM-backed and share one per-user budget. "Something went wrong" on a rate limit tells the user
      to retry immediately, which is the one thing that cannot work.
- [ ] **404 is not always an error.** `GET /profile` 404s when the profile has never been refreshed —
      that is an empty state with a call to action, not a failure banner.
- [ ] **A 401 clears the session and redirects**, and token refresh lives inside the client rather
      than at each call site.
- [ ] **Field-level 400s render against the offending field.** The backend sends
      `details: [{ path, message }]` precisely so the form can; collapsing them into one form-level
      banner throws that away.
- [ ] Never swallow a caught error — surface it or log the cause, never `catch {}`.
- [ ] Every request is **bounded by a timeout** so a hung backend cannot hang the UI forever.

## Rendering & state

- [ ] **An empty ledger gets an explicit empty state, not a screen of zeros.** Zeros read as "you
      spent nothing", which is a claim; "nothing logged yet" is the truth.
- [ ] **Loading, empty, error and populated are four states, not two.** Ask which one a fresh account
      sees first.
- [ ] **Optimistic updates need a rollback path**, and the rollback needs to be exercised — an
      optimistic update whose failure branch was never run is a guess.
- [ ] **A list keyed by array index reorders wrongly** the first time an item is dismissed. Key on
      the id.
- [ ] Dates from the API are ISO-8601 strings; render them in the **user's** timezone deliberately,
      or state that you are showing UTC. Don't let the host's locale decide silently.

## Dates & times on the wire

- [ ] **A date-time without `Z` or an offset is rejected by the backend** — by design, because an
      unzoned value means a different instant on every host. Send the designator; don't build a
      timestamp by slicing a `Date` to a string.
- [ ] **An inclusive upper bound given as a bare date covers its whole day** server-side. The period
      selector should send what it means; test the `to` side, not just `from` — midnight is
      coincidentally correct for a lower bound, which hides the bug.
- [ ] **`momDeltaCents` is a trailing window, not the previous calendar month.** Labelling it "vs.
      last month" misdescribes what the backend computed.

## Secrets & config

- [ ] **Only `NEXT_PUBLIC_*` reaches the browser — and everything under it is public.** Never the
      Supabase service-role key, never `ANTHROPIC_API_KEY`. This client talks to our API; it never
      calls Anthropic directly.
- [ ] No secrets committed; `.env.local` git-ignored; every required key documented in
      `.env.example`.
- [ ] **A "no real values" guard on `.env.example` must still allow inert ones** — blanking a
      documented default costs the reader information for no security gain. A bare URL or number
      cannot encode a credential.

## Tests

- [ ] **Tested against a stubbed transport** — no live Supabase or backend call in the suite.
- [ ] **Prove the guard fails.** A test that passes on a healthy tree has demonstrated nothing. Break
      the property, watch that test — and only that one — go red, then revert. Applies to lint rules
      too.
- [ ] **A fixture must not let the expected value coincide with an accidental one.** A category total
      that happens to equal `discretionaryTotal` passes with the bug still in. Pick values that
      appear in exactly one place.
- [ ] Unit tests cover the invariants a refactor could silently break — cents parsing, the citation
      resolver, the 429 path, optimistic rollback.

## Process (the expensive mistakes)

- [ ] **Clean-regen the lockfile after ANY dependency change** before committing:
      `rm -rf node_modules package-lock.json && npm install`. Incremental `npm install` on macOS drops
      linux-only optional deps from the lock → CI `npm ci` fails with "Missing … from lock file".
      (Bit the backend in two separate tickets.)
- [ ] **Don't review a stale diff.** Before running the reviewer, confirm GitHub has your latest push:
      `gh pr view <n> --json headRefOid -q .headRefOid` == `git rev-parse HEAD`. Reviewing before
      propagation produces phantom findings and wastes a full run.
- [ ] **Batch fixes; minimize reviewer runs.** Fix everything you can find yourself, push once, then
      review. After addressing findings, push all fixes together and re-review **at most once** —
      never re-run after each individual fix.
- [ ] **Fix anticipated issues now, don't defer them.** If you notice a problem while building, fixing
      it costs less than the reviewer finding it later and you fixing it anyway.
- [ ] **Recount anything the docs assert before opening the PR.** When the numbers _are_ the
      deliverable, stale prose is a defect in the thing being shipped, not a typo.

## Lists that mirror another source

- [ ] **A hand-written list that mirrors a schema, a router or the API drifts silently — pin it with a
      test.** Ask what the list is supposed to mirror, then assert against _that source_ rather than
      restating it. `contract.ts` is the largest such list in this repo, which is why it carries a
      SHA and a test rather than a promise. (SLAI-23: a CORS `methods` list missing `HEAD` made the
      _browser_ refuse the request while every server-side test still passed.)

## Standing caveat — the agent is stub-proven only

- [ ] **A wrong-looking profile or suggestion is not automatically a client bug.** No
      `ANTHROPIC_API_KEY` has been used against the live API; every backend agent path was built
      against a scripted stub that conforms to the schema by construction, and the published eval
      numbers measure the backend's code, not the model's output. Report it rather than building a
      client-side workaround for what may be a backend defect. The live eval run is Sprint 4.
