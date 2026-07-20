// The wire contract with the SpendLess backend — hand-copied, not imported.
//
// ─── Source ──────────────────────────────────────────────────────────────────
// Repo:   AmelBecic/spendless-ai-be
// Commit: 13e4d4ec642ce17c5b31d18b7813625f12f0a21e   ← re-diff against this SHA
// Files:  src/domain/types.ts     (Money, Category, Transaction, FixedExpense,
//                                  CategoryTotal, SpendStats, ProfileSummary,
//                                  ProfileSummaryData, Suggestion, and the
//                                  Cadence / SuggestionStatus unions)
//         src/http/errors.ts      (ErrorBody, FieldError)
//         src/routes/categories.ts      (CategoriesResponse)
//         src/routes/stats.ts           (StatsResponse)
//         src/routes/profile.ts         (ProfileResponse)
//         src/routes/suggestions.ts     (SuggestionResponse, SuggestionsResponse)
//         src/routes/transactions.ts    (TransactionResponse, TransactionsResponse)
//         src/routes/fixed-expenses.ts  (FixedExpenseResponse, FixedExpensesResponse)
//
// ─── Why copied ──────────────────────────────────────────────────────────────
// The backend's `postinstall` runs `prisma generate`, so installing it as a
// dependency would drag Prisma and the entire backend dep tree into a frontend
// install. We copy instead. The accepted cost is silent drift; the SHA above is
// the whole mitigation, and it only works if someone acts on it.
//
// ─── When you change this file ───────────────────────────────────────────────
// Re-diff against the recorded SHA, then update the SHA in the *same* commit:
//
//   git -C ../spendless-ai diff 13e4d4ec642ce17c5b31d18b7813625f12f0a21e..main \
//     -- src/domain/types.ts src/http/errors.ts src/routes/
//
// A stale SHA is worse than no SHA — it reads as "checked" when nothing was.
// `contract.test.ts` asserts the header stays present and well-formed; it cannot
// tell you the types still match, which is why the re-diff is a checklist item.
//
// ─── Invariant 4 (CLAUDE.md) ─────────────────────────────────────────────────
// Every wire type lives here and is declared nowhere else in this repo. A
// second declaration is a second source of truth that this SHA does not cover.

// ─────────────────────────────────────────────────────────────────────────────
// Domain primitives — src/domain/types.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An amount of money as integer minor units plus its currency.
 *
 * Client invariant 1: this stays integer cents in component state and on the
 * wire. Formatting happens at render only, and no `parseFloat` on an amount may
 * reach state or the API.
 */
export interface Money {
  /** Integer number of minor units (e.g. cents). Never fractional. */
  amountCents: number;
  /** ISO-4217 currency code, e.g. "EUR", "USD". */
  currency: string;
}

/** How often a fixed expense recurs. */
export type Cadence = "weekly" | "monthly" | "yearly";

/** A spend category. `key` is the stable machine identifier; `label` is for display. */
export interface Category {
  id: string;
  key: string;
  label: string;
}

/** A recurring commitment (rent, subscriptions, …). */
export interface FixedExpense {
  id: string;
  userId: string;
  label: string;
  categoryId: string;
  money: Money;
  cadence: Cadence;
  active: boolean;
  /** ISO-8601 timestamp. */
  createdAt: string;
}

/** A single day-to-day spend event — the primary stream the profile is built from. */
export interface Transaction {
  id: string;
  userId: string;
  money: Money;
  categoryId: string;
  merchant?: string;
  note?: string;
  /** ISO-8601 timestamp of when the spend happened. */
  occurredAt: string;
  /** ISO-8601 timestamp of when the row was recorded. */
  createdAt: string;
}

/** A category's contribution to total spend over a period. */
export interface CategoryTotal {
  categoryId: string;
  total: Money;
  /** Fraction of the period's total spend, 0..1. */
  share: number;
}

/**
 * Deterministically computed spend statistics for a user over a period.
 *
 * Client invariant 2: every figure below is rendered verbatim. Recomputing one
 * — a share from `total`, a sum of `byCategory` — creates a second source of
 * truth for a number the agent is citing.
 */
export interface SpendStats {
  /** ISO-8601 date (inclusive). */
  periodStart: string;
  /** ISO-8601 date (inclusive). */
  periodEnd: string;
  currency: string;
  total: Money;
  byCategory: CategoryTotal[];
  topCategories: CategoryTotal[];
  /** Fixed-expense spend attributed to the period. */
  recurringTotal: Money;
  /** Transaction (discretionary) spend in the period. */
  discretionaryTotal: Money;
  dailyAverage: Money;
  weeklyAverage: Money;
  /**
   * Signed change in total spend against the window of equal length ending the
   * day before this one starts, in cents.
   *
   * Read the comparison literally: it is a *trailing* window, not the same dates
   * of the previous calendar month. Month-to-date on 19 July is therefore
   * compared against 12–30 June, not 1–19 June. Label it in the UI accordingly —
   * calling it "vs. last month" would misdescribe what the backend computed.
   */
  momDeltaCents: number;
}

/** Structured payload of an AI-maintained profile summary. */
export interface ProfileSummaryData {
  habits: string[];
  trends: string[];
  notableChanges: string[];
}

/** A point-in-time, AI-maintained summary of a user's financial profile. */
export interface ProfileSummary {
  id: string;
  userId: string;
  /** ISO-8601 date this summary describes. */
  asOfDate: string;
  summary: ProfileSummaryData;
  narrative: string;
  /** Model id that produced it, e.g. "claude-opus-4-8". */
  model: string;
  createdAt: string;
}

export type SuggestionStatus = "new" | "dismissed" | "applied";

/**
 * A grounded, cited savings suggestion.
 *
 * Client invariant 5: `sourceRefs` is the grounding. A suggestion whose refs
 * cannot be resolved against the stats on screen must render as visibly
 * degraded — never identically to a grounded one.
 */
export interface Suggestion {
  id: string;
  userId: string;
  asOfDate: string;
  text: string;
  categoryId?: string;
  /**
   * Estimated monthly saving if applied — computed deterministically by the
   * backend, not produced by the model.
   *
   * NOTE: this is a `Money`, not the flat `estMonthlySavingsCents` that SLAI-28's
   * acceptance criteria name. The backend field has been `estMonthlySavings:
   * Money` since the type was introduced; the AC wording is what is stale. Read
   * `estMonthlySavings.amountCents` and format at render.
   */
  estMonthlySavings: Money;
  rationale: string;
  /** Ids/keys of the stats or transactions this suggestion is grounded in. */
  sourceRefs: string[];
  status: SuggestionStatus;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error envelope — src/http/errors.ts
//
// Every endpoint returns this shape on failure. `src/api/client.ts` (SLAI-25)
// is the only place that parses it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One field's validation failure. `path` is the dotted location in the request
 * (`"amountCents"`, `"money.currency"`), or `""` for a whole-object rule that
 * belongs to no single field.
 */
export interface FieldError {
  path: string;
  message: string;
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    /** Present on validation failures — one entry per offending field. */
    details?: FieldError[];
  };
}

/**
 * The `code` values this client is expected to branch on. The backend may add
 * more, so treat the set as open — match on these and fall back to `message`.
 *
 * - `VALIDATION_FAILED` — 400, carries `details`; render against the field.
 * - `NOT_FOUND`         — 404. On GET /profile it means "never refreshed yet",
 *                         which is an empty state, not an error.
 * - `MIXED_CURRENCY`    — 409, the stored ledger mixes currencies.
 * - `PERIOD_TOO_LARGE`  — 422, the requested window is too wide to aggregate.
 * - `RATE_LIMITED`      — 429 from the two LLM-backed refresh routes.
 */
export type ErrorCode =
  "VALIDATION_FAILED" | "NOT_FOUND" | "MIXED_CURRENCY" | "PERIOD_TOO_LARGE" | "RATE_LIMITED";

// ─────────────────────────────────────────────────────────────────────────────
// Response bodies — src/routes/*.ts
// ─────────────────────────────────────────────────────────────────────────────

/** GET /categories */
export interface CategoriesResponse {
  categories: Category[];
}

/** GET /stats?from=&to= */
export interface StatsResponse {
  stats: SpendStats;
}

/** GET /profile · POST /profile/refresh */
export interface ProfileResponse {
  profile: ProfileSummary;
}

/** PATCH /suggestions/:id */
export interface SuggestionResponse {
  suggestion: Suggestion;
}

/** GET /suggestions · POST /suggestions/refresh — one page plus the next cursor. */
export interface SuggestionsResponse {
  suggestions: Suggestion[];
  /** `null` once the listing is exhausted. Refresh always returns `null`. */
  nextCursor: string | null;
}

/** POST /transactions · GET /transactions/:id · PATCH /transactions/:id */
export interface TransactionResponse {
  transaction: Transaction;
}

/** GET /transactions — one page plus the cursor for the next. */
export interface TransactionsResponse {
  transactions: Transaction[];
  /** `null` once the listing is exhausted. */
  nextCursor: string | null;
}

/** POST /fixed-expenses · PATCH /fixed-expenses/:id · DELETE /fixed-expenses/:id */
export interface FixedExpenseResponse {
  fixedExpense: FixedExpense;
}

/** GET /fixed-expenses */
export interface FixedExpensesResponse {
  fixedExpenses: FixedExpense[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Request bodies & queries — derived from the zod schemas in src/routes/*.ts
//
// These are wire types too, so invariant 4 puts them here rather than beside the
// forms that build them. Note the asymmetry with the responses: a request sends
// `amountCents` + `currency` flat, while a response nests them under `money`.
// Every schema is `.strict()` — an unknown key is a 400, not a dropped field.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Largest amount the backend will accept, in cents (Postgres int4). Anything
 * above this is a 400 on `amountCents`, so the currency input can reject it
 * before a request is made.
 */
export const INT4_MAX = 2_147_483_647;

/** POST /transactions */
export interface CreateTransactionBody {
  /** Integer cents, > 0, <= INT4_MAX. A float is rejected outright, not rounded. */
  amountCents: number;
  /** 3-letter ISO-4217; the backend upper-cases it. */
  currency: string;
  categoryId: string;
  /** Empty string is stored as absent. */
  merchant?: string;
  note?: string;
  /**
   * ISO-8601. A value carrying a time MUST state its zone (`Z` or an offset) —
   * without one the backend rejects it, because an unzoned date-time would mean
   * a different instant on every host. Omitted means "now", server-side.
   */
  occurredAt?: string;
}

/**
 * PATCH /transactions/:id — at least one key required.
 *
 * `merchant` and `note` are nullable as well as optional: omitted leaves the
 * field alone, explicit `null` clears it. Without the distinction there is no
 * way to remove a merchant.
 */
export interface UpdateTransactionBody {
  amountCents?: number;
  currency?: string;
  categoryId?: string;
  merchant?: string | null;
  note?: string | null;
  occurredAt?: string;
}

/** GET /transactions */
export interface ListTransactionsQuery {
  /** ISO-8601; same zone rule as `occurredAt`. */
  from?: string;
  /** Inclusive — a bare `YYYY-MM-DD` covers its whole UTC day. */
  to?: string;
  categoryId?: string;
  /** Clamped by the backend; over the cap is a 400, not a silent truncation. */
  limit?: number;
  cursor?: string;
}

/** POST /fixed-expenses */
export interface CreateFixedExpenseBody {
  label: string;
  categoryId: string;
  amountCents: number;
  currency: string;
  cadence: Cadence;
}

/** PATCH /fixed-expenses/:id — at least one key required. */
export interface UpdateFixedExpenseBody {
  label?: string;
  categoryId?: string;
  amountCents?: number;
  currency?: string;
  cadence?: Cadence;
  /** Reactivation — the counterpart to DELETE's soft deactivate. */
  active?: boolean;
}

/** GET /fixed-expenses */
export interface ListFixedExpensesQuery {
  active?: boolean;
}

/** GET /stats */
export interface StatsQuery {
  /** ISO-8601 date. Defaults to the 1st of `to`'s month. */
  from?: string;
  /** ISO-8601 date, inclusive. Defaults to today (UTC). */
  to?: string;
}

/** GET /suggestions */
export interface ListSuggestionsQuery {
  /** A whole UTC day — suggestions are produced per `asOfDate`. */
  asOfDate?: string;
  status?: SuggestionStatus;
  limit?: number;
  cursor?: string;
}

/**
 * PATCH /suggestions/:id
 *
 * `"new"` is deliberately not settable: it is the state the agent writes, and
 * letting a client rewind a decision would make "dismissed" mean nothing.
 */
export interface UpdateSuggestionBody {
  status: Exclude<SuggestionStatus, "new">;
}
