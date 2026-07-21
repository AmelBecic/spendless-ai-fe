"use client";

// The suggestions feed (SLAI-28): the screen that makes this a grounded agent
// rather than a chatbot with a database. Each suggestion is shown next to the
// citation it rests on, and one whose citation this client cannot resolve is
// rendered visibly degraded (invariant 5) — never identically to a grounded one.
//
// Three things load here, because the grounding needs all of them:
//   - GET /suggestions        — the feed itself.
//   - GET /categories         — to resolve `category:` refs (via useCategories).
//   - GET /fixed-expenses     — to resolve `fixedExpense:` refs.
// `stat:` refs resolve against a static allowlist in grounding.ts, so no /stats
// request is needed to cite them.
//
// Actions (apply / dismiss) go through PATCH /suggestions/:id with an optimistic
// update and rollback on failure. Refresh (POST /suggestions/refresh) is
// LLM-backed and shares SLAI-25's per-user rate budget, so a 429 surfaces the
// real wait the client already assembled onto `ApiError.userMessage`.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FixedExpense, Suggestion, SuggestionStatus } from "../api/contract";
import { api } from "../api/client";
import { useCategories } from "../hooks/useCategories";
import { formatMoney } from "../money/formatMoney";
import { resolveGrounding, type GroundingContext } from "../suggestions/grounding";

type FeedState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; suggestions: Suggestion[] };

// The two terminal actions a user can take. `"new"` is deliberately not settable
// (contract.ts) — it is the state the agent writes.
type Action = Exclude<SuggestionStatus, "new">;

// A stable empty reference so `groundingCtx`'s memo does not re-fire every render
// while expenses are still loading or failed.
const EMPTY_EXPENSES: FixedExpense[] = [];

// Every failure from the shared client is an `ApiError` carrying a
// written-for-humans `userMessage`; trust only that. An untyped rejection is
// unexpected — log it and show the written fallback rather than leaking a raw
// `Error.message` into a banner.
function userMessageOf(cause: unknown, fallback: string): string {
  if (typeof (cause as { userMessage?: unknown })?.userMessage === "string") {
    return (cause as { userMessage: string }).userMessage;
  }
  console.error(cause);
  return fallback;
}

type ExpensesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; expenses: FixedExpense[] };

export function SuggestionsSection() {
  const [feed, setFeed] = useState<FeedState>({ status: "loading" });
  const [expensesState, setExpensesState] = useState<ExpensesState>({ status: "loading" });

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Per-suggestion action errors, keyed by suggestion id. No "pending" set is
  // needed: the optimistic status flip below removes a card's action buttons the
  // instant it is clicked, so a second action on the same card is not reachable.
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  // Categories resolve `category:` refs; fixed expenses resolve `fixedExpense:`
  // refs. Both are second, independent fetches that routinely arrive AFTER the
  // feed — so the cards are held until they settle (see `groundingReady` below).
  // Rendering a card before then would flash a genuinely grounded suggestion as
  // "Grounding unavailable" until the context loaded, which is the exact
  // second-fetch race the checklist calls out (SLAI-27, reviewer).
  const { categories, loading: categoriesLoading, error: categoriesError } = useCategories();

  // A mutation (PATCH) has no AbortSignal wired through the client, so guard
  // against setting state on an unmounted component the plain way.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadFeed = useCallback((signal?: AbortSignal) => {
    return api
      .getSuggestions({}, signal)
      .then((res) => setFeed({ status: "ready", suggestions: res.suggestions }))
      .catch((cause: unknown) => {
        if (signal?.aborted) return;
        setFeed({ status: "error", message: userMessageOf(cause, "Could not load your suggestions.") });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadFeed(controller.signal);
    // Fixed expenses are grounding context, not the feed: a failure here must not
    // blank the feed. It leaves `fixedExpense:` refs unresolved — the cards that
    // cite one degrade, and the section-level note below says the evidence could
    // not be loaded rather than implying the suggestion itself is unfounded.
    api
      .listFixedExpenses({}, controller.signal)
      .then((res) => setExpensesState({ status: "ready", expenses: res.fixedExpenses }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setExpensesState({
          status: "error",
          message: userMessageOf(cause, "Could not load your fixed expenses."),
        });
      });
    return () => controller.abort();
  }, [loadFeed]);

  const expenses = expensesState.status === "ready" ? expensesState.expenses : EMPTY_EXPENSES;
  const groundingCtx: GroundingContext = useMemo(
    () => ({ categories, fixedExpenses: expenses }),
    [categories, expenses],
  );

  // The grounding verdict is only trustworthy once both context fetches have
  // settled (loaded or failed) — until then a ref that will resolve looks
  // unresolved. Hold the cards until then, exactly as StatsSection holds its
  // per-category rows for the category labels.
  const groundingReady = !categoriesLoading && expensesState.status !== "loading";
  // A context fetch that outright failed is worth naming: those suggestions show
  // as unverified because OUR data could not load, not because they are unfounded.
  const groundingError = categoriesError ?? (expensesState.status === "error" ? expensesState.message : null);

  function handleRetry() {
    setFeed({ status: "loading" });
    loadFeed();
  }

  async function handleRefresh() {
    setRefreshError(null);
    setRefreshing(true);
    try {
      const { suggestions } = await api.refreshSuggestions();
      if (!mounted.current) return;
      setFeed({ status: "ready", suggestions });
      setActionErrors({});
    } catch (cause) {
      if (!mounted.current) return;
      // For a 429 this is the "you have used up your refresh budget, try again in
      // N minutes" message the client built from Retry-After.
      setRefreshError(userMessageOf(cause, "Could not refresh your suggestions."));
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }

  function patchStatus(id: string, updater: (s: Suggestion) => Suggestion) {
    setFeed((prev) =>
      prev.status === "ready"
        ? { status: "ready", suggestions: prev.suggestions.map((s) => (s.id === id ? updater(s) : s)) }
        : prev,
    );
  }

  async function handleAction(suggestion: Suggestion, action: Action) {
    const id = suggestion.id;
    // Snapshot the pre-action status so a failed request can be rolled back to
    // exactly what was on screen, not to a guessed "new".
    const previousStatus = suggestion.status;

    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    // Optimistic: flip the status now so the card reflects the choice immediately
    // (which also hides its action buttons, preventing a second action).
    patchStatus(id, (s) => ({ ...s, status: action }));

    try {
      const { suggestion: saved } = await api.updateSuggestion(id, { status: action });
      if (!mounted.current) return;
      // Replace with the server's row — the source of truth, not the optimistic guess.
      patchStatus(id, () => saved);
    } catch (cause) {
      if (!mounted.current) return;
      // Roll back to the exact prior status and surface why.
      patchStatus(id, (s) => ({ ...s, status: previousStatus }));
      setActionErrors((prev) => ({
        ...prev,
        [id]: userMessageOf(cause, "Could not update this suggestion."),
      }));
    }
  }

  return (
    <section aria-labelledby="suggestions-heading">
      <div className="section-head">
        <h2 id="suggestions-heading">Suggestions</h2>
        {feed.status !== "loading" && feed.status !== "error" ? (
          <button type="button" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh suggestions"}
          </button>
        ) : null}
      </div>

      {/* Loading covers both the feed itself and the grounding context: a card
          cannot be shown until its citations can be resolved, or it flashes as
          degraded then flips to grounded. */}
      {feed.status === "loading" || (feed.status === "ready" && feed.suggestions.length > 0 && !groundingReady) ? (
        <p aria-live="polite">Loading suggestions…</p>
      ) : null}

      {feed.status === "error" ? (
        <>
          <p role="alert" className="field-error">
            {feed.message}
          </p>
          {/* A transient load failure needs a way back that is not a page reload.
              This re-runs the GET; it does not spend the refresh budget. */}
          <button type="button" onClick={handleRetry}>
            Try again
          </button>
        </>
      ) : null}

      {feed.status === "ready" && feed.suggestions.length === 0 ? (
        <p data-testid="suggestions-empty">
          No suggestions yet — refresh to generate some from what you have logged.
        </p>
      ) : null}

      {feed.status === "ready" && feed.suggestions.length > 0 && groundingReady ? (
        <>
          {groundingError ? (
            // The grounding data itself failed to load — so the degraded cards
            // below are unverified because of us, not because the suggestions are
            // unfounded. Say which, rather than let the per-card note imply blame.
            <p role="status" className="field-error">
              Some supporting evidence couldn’t load, so affected suggestions are shown unverified.
            </p>
          ) : null}
          <ul className="suggestion-list">
            {feed.suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                grounding={resolveGrounding(suggestion, groundingCtx)}
                actionError={actionErrors[suggestion.id] ?? null}
                onAction={(action) => handleAction(suggestion, action)}
              />
            ))}
          </ul>
        </>
      ) : null}

      {refreshError ? (
        <p role="alert" className="field-error">
          {refreshError}
        </p>
      ) : null}
    </section>
  );
}

const STATUS_BADGE: Record<Action, string> = {
  applied: "Applied",
  dismissed: "Dismissed",
};

function SuggestionCard({
  suggestion,
  grounding,
  actionError,
  onAction,
}: {
  suggestion: Suggestion;
  grounding: ReturnType<typeof resolveGrounding>;
  actionError: string | null;
  onAction: (action: Action) => void;
}) {
  const { grounded, citations } = grounding;
  const isNew = suggestion.status === "new";

  return (
    <li
      className={grounded ? "suggestion-card" : "suggestion-card suggestion-card--degraded"}
      // A machine-readable grounding flag so the distinction can never collapse
      // to "looks the same" — tests and styling both key on it.
      data-grounded={grounded}
    >
      {!grounded ? (
        <p className="suggestion-degraded-note" role="note">
          Grounding unavailable — the evidence this suggestion cites could not be verified, so treat
          it with caution.
        </p>
      ) : null}

      <p className="suggestion-text">{suggestion.text}</p>

      <p className="suggestion-saving">
        Estimated monthly saving:{" "}
        <strong className="suggestion-saving-value">{formatMoney(suggestion.estMonthlySavings)}</strong>
      </p>

      <p className="suggestion-rationale">{suggestion.rationale}</p>

      {/* The citation, shown inline beside the claim — not behind a tooltip or an
          expander (AC bullet 1). */}
      <div className="suggestion-citations">
        <span className="citations-label">Grounded in</span>
        {citations.length > 0 ? (
          <ul className="citation-list">
            {citations.map((citation) => (
              <li
                key={citation.ref}
                className={citation.resolved ? "citation" : "citation citation--unresolved"}
              >
                {citation.resolved ? (
                  citation.label
                ) : (
                  <>
                    Unverified reference <code>{citation.ref}</code>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="citation citation--unresolved">No supporting evidence cited</span>
        )}
      </div>

      {!isNew ? (
        <span className="suggestion-badge">{STATUS_BADGE[suggestion.status as Action]}</span>
      ) : null}

      {isNew ? (
        <div className="suggestion-actions">
          <button type="button" onClick={() => onAction("applied")}>
            Apply
          </button>
          <button type="button" onClick={() => onAction("dismissed")}>
            Dismiss
          </button>
        </div>
      ) : null}

      {actionError ? (
        <p role="alert" className="field-error">
          {actionError}
        </p>
      ) : null}
    </li>
  );
}
