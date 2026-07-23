"use client";

// The stats half of the dashboard (SLAI-27). Fetches `GET /stats` for the
// selected period and renders every figure the AC names — total, the
// recurring/discretionary split, daily/weekly averages, the month-over-month
// delta, top categories and the full per-category breakdown.
//
// Invariant 2 is the load-bearing one here: NOTHING on this screen is computed.
// Every amount is a `Money` from the response formatted at render; every share
// is the API's own fraction handed to `Intl` (formatShare); the delta is the
// API's `momDeltaCents` wrapped in a `Money`, never a subtraction we did. There
// is no `+`, `-`, `*` or `/` on a figure anywhere below.

import { useEffect, useMemo, useState } from "react";
import type { Category, CategoryTotal, Money, SpendStats } from "../api/contract";
import { api } from "../api/client";
import { formatMoney } from "../money/formatMoney";
import { formatShare } from "../stats/formatShare";
import type { Period } from "../dates/periods";

type StatsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; stats: SpendStats };

// The shared `api` client wraps every failure into an `ApiError` carrying a
// written-for-humans `userMessage`, so that is the only field trusted here. A
// rejection without one is unexpected: log the cause and show the written
// fallback, never a raw `Error.message` — that would leak "Failed to fetch" or
// an HTML-page parse error straight into the alert banner.
function userMessageOf(cause: unknown, fallback: string): string {
  if (typeof (cause as { userMessage?: unknown })?.userMessage === "string") {
    return (cause as { userMessage: string }).userMessage;
  }
  console.error(cause);
  return fallback;
}

export function StatsSection({
  period,
  categories,
  categoriesLoading,
  categoriesError,
}: {
  period: Period;
  // Shared from the screen, same as the log screen's sections — the immutable
  // category list is fetched once and reused to label the per-category rows.
  // Its loading/error state is threaded through too: stats and categories are
  // independent requests, so the stats grid routinely arrives first, and a
  // labeller that fell back to the raw id would flash UUIDs on the one screen
  // whose whole point is being citable (and print them forever if the fetch
  // failed).
  categories: Category[];
  categoriesLoading: boolean;
  categoriesError: string | null;
}) {
  const [state, setState] = useState<StatsState>({ status: "loading" });

  useEffect(() => {
    // The parent remounts this section on a period change (a `key` on the period
    // id), so each mount starts from the initial `loading` state and this effect
    // just fetches — no synchronous state reset in the effect body.
    const controller = new AbortController();
    api
      .getStats({ from: period.from, to: period.to }, controller.signal)
      .then((res) => setState({ status: "ready", stats: res.stats }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        // A backend envelope (PERIOD_TOO_LARGE, MIXED_CURRENCY, …) already
        // carries a written-for-humans `userMessage`; surface it verbatim.
        setState({ status: "error", message: userMessageOf(cause, "Could not load your stats.") });
      });
    return () => controller.abort();
  }, [period.from, period.to]);

  const labelFor = useMemo(() => categoryLabeller(categories), [categories]);

  return (
    <section aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="mb-3 font-display text-lg font-semibold text-ink">
        Spending
      </h2>

      {state.status === "loading" ? (
        <p aria-live="polite" className="text-sm text-muted">
          Loading stats…
        </p>
      ) : null}
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-coral-ink">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" ? (
        <StatsBody
          stats={state.stats}
          labelFor={labelFor}
          categoriesLoading={categoriesLoading}
          categoriesError={categoriesError}
        />
      ) : null}
    </section>
  );
}

function StatsBody({
  stats,
  labelFor,
  categoriesLoading,
  categoriesError,
}: {
  stats: SpendStats;
  labelFor: (id: string) => string;
  categoriesLoading: boolean;
  categoriesError: string | null;
}) {
  // An empty ledger: nothing spent AND no per-category rows. Both signals,
  // because an empty `byCategory` alone can also mean "spend exists but is
  // uncategorised" — suppressing a non-zero total behind "nothing logged" would
  // be a stronger misstatement than the zero-grid the AC guards against. The
  // `=== 0` is a comparison of an API value, not arithmetic (invariant 2 intact).
  // Show the explicit empty state rather than a grid of €0.00 tiles — zeros read
  // as "you spent nothing", which is a claim; "nothing logged" is the truth.
  if (stats.total.amountCents === 0 && stats.byCategory.length === 0) {
    return (
      <p data-testid="stats-empty" className="text-sm text-muted">
        Nothing logged for {stats.periodStart} – {stats.periodEnd} yet.
      </p>
    );
  }

  // The delta is a signed cents figure, not a `Money`. Wrapping the API value in
  // a `Money` (with the API's own currency) so formatMoney can render it is not
  // arithmetic — the number itself is untouched, sign and all, and the minus
  // sign the formatter prints is what tells the user the direction.
  const delta: Money = { amountCents: stats.momDeltaCents, currency: stats.currency };

  return (
    <>
      <p className="mb-4 text-sm tabular-nums text-muted">
        {stats.periodStart} – {stats.periodEnd}
      </p>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
        <Stat label="Total spend" value={formatMoney(stats.total)} />
        <Stat label="Recurring" value={formatMoney(stats.recurringTotal)} />
        <Stat label="Discretionary" value={formatMoney(stats.discretionaryTotal)} />
        <Stat label="Daily average" value={formatMoney(stats.dailyAverage)} />
        <Stat label="Weekly average" value={formatMoney(stats.weeklyAverage)} />
        {/* Deliberately NOT "vs. last month": momDeltaCents compares against a
            trailing window of equal length, not the previous calendar month
            (contract.ts + checklist). */}
        <Stat label="Change vs. preceding window" value={formatMoney(delta)} />
      </dl>

      {categoriesError ? (
        // Non-fatal: the totals and shares still stand on their own; only the
        // labels are missing, so say so rather than silently printing ids.
        <p role="status" className="mt-3 text-sm text-coral-ink">
          Category names couldn’t load — amounts are shown without labels.
        </p>
      ) : null}

      <CategoryList
        heading="Top categories"
        totals={stats.topCategories}
        labelFor={labelFor}
        loading={categoriesLoading}
      />
      <CategoryList
        heading="All categories"
        totals={stats.byCategory}
        labelFor={labelFor}
        loading={categoriesLoading}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-tile border border-line bg-surface p-4 shadow-soft">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight text-ink">
        {value}
      </dd>
    </div>
  );
}

function CategoryList({
  heading,
  totals,
  labelFor,
  loading,
}: {
  heading: string;
  totals: CategoryTotal[];
  labelFor: (id: string) => string;
  loading: boolean;
}) {
  if (totals.length === 0) return null;
  return (
    <div className="mt-7">
      <h3 className="mb-2 font-display text-sm font-semibold text-ink">{heading}</h3>
      {loading ? (
        // Hold the rows until the labels exist rather than paint raw ids that
        // then swap to names a beat later.
        <p aria-live="polite" className="text-sm text-muted">
          Loading categories…
        </p>
      ) : (
        <ul className="flex flex-col">
          {totals.map((entry) => (
            <li
              key={entry.categoryId}
              className="flex items-baseline gap-3 border-b border-line py-2 last:border-b-0"
            >
              <span className="text-sm text-ink">{labelFor(entry.categoryId)}</span>
              <span className="ml-auto font-medium tabular-nums text-ink">
                {formatMoney(entry.total)}
              </span>
              <span className="w-14 text-right text-sm tabular-nums text-muted">
                {formatShare(entry.share)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Resolve a category id to its label. An unresolved id (unknown, or the list
 * failed to load) renders as "Unknown category" rather than a raw UUID — this is
 * the citable screen, and an id leaked into it reads as a real category name. */
function categoryLabeller(categories: Category[]): (id: string) => string {
  const byId = new Map(categories.map((c) => [c.id, c.label]));
  return (id) => byId.get(id) ?? "Unknown category";
}
