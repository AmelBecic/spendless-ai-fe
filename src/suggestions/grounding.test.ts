import { describe, expect, it } from "vitest";
import type { Category, FixedExpense, Suggestion } from "../api/contract";
import { resolveGrounding } from "./grounding";

const CATEGORIES: Category[] = [
  { id: "cat-food", key: "food", label: "Food & drink" },
  { id: "cat-rent", key: "rent", label: "Rent" },
];

const EXPENSES: FixedExpense[] = [
  {
    id: "exp-gym",
    userId: "u1",
    label: "Gym",
    categoryId: "cat-rent",
    money: { amountCents: 3000, currency: "EUR" },
    cadence: "monthly",
    active: true,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
];

const CTX = { categories: CATEGORIES, fixedExpenses: EXPENSES };

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: "sug-1",
    userId: "u1",
    asOfDate: "2026-07-21",
    text: "Trim your food spending.",
    categoryId: "cat-food",
    estMonthlySavings: { amountCents: 4500, currency: "EUR" },
    rationale: "Food is your largest discretionary category.",
    sourceRefs: ["category:cat-food", "stat:discretionaryTotal"],
    status: "new",
    createdAt: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveGrounding", () => {
  it("resolves a trim suggestion's category and stat refs", () => {
    const { grounded, citations } = resolveGrounding(suggestion(), CTX);

    expect(grounded).toBe(true);
    expect(citations).toEqual([
      { ref: "category:cat-food", label: "Category: Food & drink", resolved: true },
      { ref: "stat:discretionaryTotal", label: "Discretionary spending", resolved: true },
    ]);
  });

  it("resolves a fixed-expense ref to its label and amount, formatted verbatim", () => {
    const { grounded, citations } = resolveGrounding(
      suggestion({ sourceRefs: ["fixedExpense:exp-gym", "stat:recurringTotal"] }),
      CTX,
    );

    expect(grounded).toBe(true);
    expect(citations[0]).toEqual({
      ref: "fixedExpense:exp-gym",
      label: "Gym (€30.00)",
      resolved: true,
    });
  });

  it("degrades when a category ref names an id not in the loaded list", () => {
    // The independent check: a ref the backend accepted but this client cannot
    // match against real data must not read as grounded.
    const { grounded, citations } = resolveGrounding(
      suggestion({ sourceRefs: ["category:cat-ghost", "stat:discretionaryTotal"] }),
      CTX,
    );

    expect(grounded).toBe(false);
    expect(citations[0]).toEqual({ ref: "category:cat-ghost", label: null, resolved: false });
    // The other ref still resolves — a partially-degraded card shows both.
    expect(citations[1]!.resolved).toBe(true);
  });

  it("degrades on an unknown stat field", () => {
    const { grounded, citations } = resolveGrounding(
      suggestion({ sourceRefs: ["stat:madeUpMetric"] }),
      CTX,
    );

    expect(grounded).toBe(false);
    expect(citations[0]!.resolved).toBe(false);
  });

  it("degrades on an unknown namespace (backend drift)", () => {
    const { grounded, citations } = resolveGrounding(
      suggestion({ sourceRefs: ["txn:abc123"] }),
      CTX,
    );

    expect(grounded).toBe(false);
    expect(citations[0]!.resolved).toBe(false);
  });

  it("degrades a ref with no namespace separator", () => {
    const { grounded } = resolveGrounding(suggestion({ sourceRefs: ["discretionaryTotal"] }), CTX);
    expect(grounded).toBe(false);
  });

  it("treats an uncited suggestion as ungrounded", () => {
    const { grounded, citations } = resolveGrounding(suggestion({ sourceRefs: [] }), CTX);
    expect(grounded).toBe(false);
    expect(citations).toEqual([]);
  });

  it("degrades every category ref when categories failed to load", () => {
    // Empty context: nothing resolves, so no suggestion can claim to be grounded.
    const { grounded } = resolveGrounding(suggestion(), { categories: [], fixedExpenses: [] });
    expect(grounded).toBe(false);
  });
});
