// Resolving a suggestion's citations — the load-bearing half of SLAI-28 and
// client invariant 5 (CLAUDE.md).
//
// A suggestion carries `sourceRefs`: namespaced strings naming the stats,
// categories or commitments it rests on (`category:<id>`, `stat:<field>`,
// `fixedExpense:<id>`). The backend claims it only ever persists refs that name
// something real — but the standing caveat is that the agent is stub-proven
// only, so that claim is unverified against the live model. Resolving each ref
// against the data THIS client loaded is therefore an independent check, not a
// formality: a fabricated or drifted ref fails to resolve here even if it slipped
// past the backend.
//
// The rule this file encodes: a suggestion is grounded only if it cites at least
// one ref and EVERY ref resolves. Anything less renders visibly degraded
// (SuggestionCard), because a citation the client cannot stand behind must not
// look identical to one it can.

import type { Category, FixedExpense, Suggestion } from "../api/contract";
import { formatMoney } from "../money/formatMoney";

// The `SpendStats` money fields a suggestion may cite as `stat:<field>`. This is
// the client's own allowlist: a `stat:` ref outside it names no dimension we
// recognise and so does not resolve. Kept in sync with `SpendStats` by hand,
// same discipline as the copied contract — an unknown stat degrading loudly is
// the intended failure, not a bug to paper over with a permissive match.
const KNOWN_STAT_LABELS: Record<string, string> = {
  total: "Total spending",
  recurringTotal: "Recurring spending",
  discretionaryTotal: "Discretionary spending",
  dailyAverage: "Daily average spend",
  weeklyAverage: "Weekly average spend",
};

/** The data a suggestion's refs are resolved against — everything this screen loaded. */
export interface GroundingContext {
  categories: Category[];
  fixedExpenses: FixedExpense[];
}

/** One resolved (or unresolved) `sourceRef`. */
export interface Citation {
  /** The raw ref, always kept so an unresolved one is shown, never dropped. */
  ref: string;
  /** Human-readable grounding when the ref resolves; `null` when it does not. */
  label: string | null;
  /** True when `ref` names something this client recognises. */
  resolved: boolean;
}

export interface Grounding {
  citations: Citation[];
  /** Grounded ⇔ at least one ref AND every ref resolved. See the file header. */
  grounded: boolean;
}

/** Resolve every `sourceRef` on a suggestion against the loaded context. */
export function resolveGrounding(suggestion: Suggestion, ctx: GroundingContext): Grounding {
  const categoryById = new Map(ctx.categories.map((c) => [c.id, c.label]));
  const expenseById = new Map(ctx.fixedExpenses.map((e) => [e.id, e]));

  const citations = suggestion.sourceRefs.map((ref) => resolveRef(ref, categoryById, expenseById));
  // An uncited suggestion is the purest ungrounded case: nothing to stand on, so
  // it can never be grounded. A single unresolved ref is enough to degrade too —
  // a claim is only as grounded as its weakest citation.
  const grounded = citations.length > 0 && citations.every((c) => c.resolved);

  return { citations, grounded };
}

function resolveRef(
  ref: string,
  categoryById: Map<string, string>,
  expenseById: Map<string, FixedExpense>,
): Citation {
  const sep = ref.indexOf(":");
  // No namespace at all — not a shape we can resolve.
  if (sep === -1) return { ref, label: null, resolved: false };

  const namespace = ref.slice(0, sep);
  const rest = ref.slice(sep + 1);

  switch (namespace) {
    case "category": {
      const label = categoryById.get(rest);
      return label ? { ref, label: `Category: ${label}`, resolved: true } : unresolved(ref);
    }
    case "stat": {
      const label = KNOWN_STAT_LABELS[rest];
      return label ? { ref, label, resolved: true } : unresolved(ref);
    }
    case "fixedExpense": {
      const expense = expenseById.get(rest);
      // The amount is formatted at render (invariant 1), verbatim from the
      // expense — a real figure the user can recognise beside the claim.
      return expense
        ? { ref, label: `${expense.label} (${formatMoney(expense.money)})`, resolved: true }
        : unresolved(ref);
    }
    default:
      // An unknown namespace (a ref kind the backend added that this client has
      // not learned yet) is unresolved by design — drift surfaces as a degraded
      // card rather than a confident-looking citation we cannot vouch for.
      return unresolved(ref);
  }
}

function unresolved(ref: string): Citation {
  return { ref, label: null, resolved: false };
}
