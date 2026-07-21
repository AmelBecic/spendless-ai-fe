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

function userMessageOf(cause: unknown, fallback: string): string {
  if (typeof (cause as { userMessage?: unknown })?.userMessage === "string") {
    return (cause as { userMessage: string }).userMessage;
  }
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function StatsSection({
  period,
  categories,
}: {
  period: Period;
  // Shared from the screen, same as the log screen's sections — the immutable
  // category list is fetched once and reused to label the per-category rows.
  categories: Category[];
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
      <h2 id="stats-heading">Spending</h2>

      {state.status === "loading" ? <p aria-live="polite">Loading stats…</p> : null}
      {state.status === "error" ? (
        <p role="alert" className="field-error">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" ? <StatsBody stats={state.stats} labelFor={labelFor} /> : null}
    </section>
  );
}

function StatsBody({
  stats,
  labelFor,
}: {
  stats: SpendStats;
  labelFor: (id: string) => string;
}) {
  // An empty ledger has no per-category spend. Show that as an explicit empty
  // state rather than a grid of €0.00 tiles — zeros read as "you spent nothing",
  // which is a claim; "nothing logged" is the truth (AC + checklist).
  if (stats.byCategory.length === 0) {
    return (
      <p data-testid="stats-empty">
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
      <p className="stats-period">
        {stats.periodStart} – {stats.periodEnd}
      </p>

      <dl className="stat-grid">
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

      <CategoryList heading="Top categories" totals={stats.topCategories} labelFor={labelFor} />
      <CategoryList heading="All categories" totals={stats.byCategory} labelFor={labelFor} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <dt className="stat-label">{label}</dt>
      <dd className="stat-value">{value}</dd>
    </div>
  );
}

function CategoryList({
  heading,
  totals,
  labelFor,
}: {
  heading: string;
  totals: CategoryTotal[];
  labelFor: (id: string) => string;
}) {
  if (totals.length === 0) return null;
  return (
    <div className="category-block">
      <h3>{heading}</h3>
      <ul className="category-list">
        {totals.map((entry) => (
          <li key={entry.categoryId} className="category-row">
            <span className="category-label">{labelFor(entry.categoryId)}</span>
            <span className="category-total">{formatMoney(entry.total)}</span>
            <span className="category-share">{formatShare(entry.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Resolve a category id to its label, falling back to the id rather than a
 * blank when the list has not loaded or the id is unknown. */
function categoryLabeller(categories: Category[]): (id: string) => string {
  const byId = new Map(categories.map((c) => [c.id, c.label]));
  return (id) => byId.get(id) ?? id;
}
