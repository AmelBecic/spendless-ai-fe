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
- [ ] **A `details.path` the form does not render must still reach the user — route it to the
      form-level fallback, never drop it into an unread `fields` key.** A non-empty path that matches
      no input silently vanishes: it is neither shown against a field nor surfaced at form level,
      which is the exact "something is wrong, but not which box" failure the field-level rule exists
      to prevent. Watch the request/response asymmetry: a body sends `amountCents`/`currency` flat,
      but a validation path may still arrive nested (`money.currency`) — normalize it onto the flat
      key the form renders. (SLAI-26, reviewer.)
- [ ] Never swallow a caught error — surface it or log the cause, never `catch {}`.
- [ ] Every request is **bounded by a timeout** so a hung backend cannot hang the UI forever.
- [ ] **Wire up cancellation before the first `await`, not before the `fetch`.** Resolving the access
      token is itself an await, so a caller that aborts in that window finds no listener attached: the
      request goes out anyway and only the timeout can end it. Test the abort that happens *during*
      token resolution, not just the one during the request. (SLAI-25.)
- [ ] **A third-party library's error message is not automatically a user-facing one.** Supabase
      reports a transport failure as "Failed to fetch" (engine-dependent); rendering it verbatim gives
      the user a browser internal where advice belongs. Translate at the auth/API boundary and keep
      the original as `cause`. (SLAI-25.)
- [ ] **Neither is your own synthesised fallback.** When a failing response carries no envelope, the
      only `message` available is one you built (`GET /stats failed with 502`). Keep the diagnostic on
      `message` and give the user a separate written-for-humans string — and assert on *that* field in
      the test, not just on `code`. (SLAI-25, reviewer.)
- [ ] **Key a status-driven branch on the status, not only on the backend's code.** A 429 from a proxy
      or gateway never carries `RATE_LIMITED`, so a code-only check silently drops the rate-limit path
      on the exact hop most likely to emit it. (SLAI-25, reviewer.)
- [ ] **A request timer must cover the body read, not just the headers.** `fetch` resolves as soon as
      headers arrive; clearing the timeout before `response.text()` leaves a server that stalls the
      body able to hang the UI forever — the invariant you thought you had. (SLAI-25, reviewer.)
- [ ] **"Could not read the session" is not "there is no session."** Downgrading a failed session read
      to an anonymous request earns a 401, and the 401 path then signs out a user whose session was
      merely unreadable for a moment. (SLAI-25, reviewer.)

## Tests that only look like guards

- [ ] **A race test must assert after the losing write has been flushed.** Asserting straight after
      resolving the slow promise passes whether or not the race is guarded, because React has not
      processed the clobber yet — wrap the resolve in `act` and flush before asserting. Caught by
      running the test against a deliberately un-guarded tree. (SLAI-25.)
- [ ] **A stub must reproduce the semantics under test, not just the shape.** A hand-built `Response`
      is not tied to the request's `AbortSignal` the way a real `fetch` body is, so a "body stalls"
      test built on one proves nothing about cancellation. Wire the stub to the signal. (SLAI-25.)

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
- [ ] **A label that depends on a second, independent fetch must handle that fetch's loading and
      error states — don't fall back to the raw id.** When a view joins two requests (stats +
      categories), the one it renders often arrives first, so a labeller that returns the id on a miss
      flashes UUIDs on screen — and prints them forever if the label fetch fails. Thread the label
      hook's `loading`/`error` down: hold the rows until labels resolve, and degrade an unknown id to
      a written "Unknown category", never the id. (SLAI-27, reviewer.)
- [ ] **`userMessageOf`-style helpers must trust only the client's typed `userMessage`, never fall
      back to a raw `Error.message`.** The `api` client wraps every failure into an `ApiError` with a
      written-for-humans message, so the raw-message branch only ever fires for an unexpected untyped
      throw — where it leaks "Failed to fetch" or an HTML-page `SyntaxError` into an alert. Log the
      cause and show the written fallback instead. (SLAI-27, reviewer.)

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

## Guards, gates & enforced seams

- [ ] **Scope an enforced seam default-deny, not by listing today's directories.** A lint rule
      applied to `src/app`, `src/components`, `src/hooks` leaves a later `src/lib` or `src/features`
      unrestricted, so the seam stops covering new code with nothing going red. Restrict `src/**` and
      exempt the one caller. (SLAI-24, reviewer.)
- [ ] **`no-restricted-globals` matches the bare identifier only.** `window.fetch` and
      `globalThis.fetch` are member expressions and sail past it — pair it with
      `no-restricted-properties` or the rule enforces nothing against anyone who knows that.
- [ ] **A guard that scans a subtree only guarantees that subtree.** If the criterion says "nowhere
      in the repo", walk the repo root with an ignore list. (SLAI-24: the invariant-4 test scanned
      only `src/`.)
- [ ] **A name-suffix regex is a weak definition of a thing.** Matching `…Response` catches the
      copy-paste but not `StatsPayload` or `ProfileDto` — the same duplicate wearing a different
      name. Name the types you own as well.
- [ ] **Never discard the output of a tool whose failure blocks a commit.** `2>/dev/null` on a
      gitleaks hook leaves the developer with "a secret was found" and no file, line or rule, forcing
      a manual re-run to act on the block. (SLAI-24, reviewer.)
- [ ] **Don't exempt test files from a "declared nowhere else" scan.** A fixture is where a
      hand-rolled response shape appears first, and the production code then gets written to match
      the fixture — drift the recorded SHA never covers. (SLAI-24, reviewer round two.)
- [ ] **A gate that needs a manual opt-in per clone is off by default.** If `npm install` can wire it
      (a `prepare` script pointing `core.hooksPath`), wire it — a README step is not a control, and a
      fresh clone that skips it commits with no secret scan at all.
- [ ] **Check a CLI's subcommand against `--help`, not just against exit code.** A command can still
      work while being unlisted and deprecated — `gitleaks detect` exits 0 on 8.30 but no longer
      appears in the command list, so it is a break waiting for the next upgrade.

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
