import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, FixedExpense, Suggestion } from "../api/contract";

// Everything the feed touches goes through the shared client; stub it rather
// than reach a backend. useCategories calls api.getCategories, so it is stubbed
// here too.
vi.mock("../api/client", () => ({
  api: {
    getSuggestions: vi.fn(),
    listFixedExpenses: vi.fn(),
    getCategories: vi.fn(),
    updateSuggestion: vi.fn(),
    refreshSuggestions: vi.fn(),
  },
}));

import { api } from "../api/client";
import { SuggestionsSection } from "./SuggestionsSection";

const mockApi = vi.mocked(api);

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

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: "sug-1",
    userId: "u1",
    asOfDate: "2026-07-21",
    text: "Trim your food spending by cooking twice more a week.",
    categoryId: "cat-food",
    estMonthlySavings: { amountCents: 4500, currency: "EUR" },
    rationale: "Food is your largest discretionary category.",
    sourceRefs: ["category:cat-food", "stat:discretionaryTotal"],
    status: "new",
    createdAt: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}

/** A never-resolving promise, to hold a request pending while the optimistic
 *  state is asserted. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults; individual tests override what they exercise.
  mockApi.getCategories.mockResolvedValue({ categories: CATEGORIES });
  mockApi.listFixedExpenses.mockResolvedValue({ fixedExpenses: EXPENSES });
  mockApi.getSuggestions.mockResolvedValue({ suggestions: [], nextCursor: null });
  mockApi.refreshSuggestions.mockResolvedValue({ suggestions: [], nextCursor: null });
});

describe("SuggestionsSection", () => {
  it("renders each suggestion with its citation visible and the saving formatted verbatim", async () => {
    mockApi.getSuggestions.mockResolvedValue({ suggestions: [suggestion()], nextCursor: null });

    render(<SuggestionsSection />);

    // The claim and the saving, taken straight from the API.
    expect(await screen.findByText(/Trim your food spending/)).toBeInTheDocument();
    expect(screen.getByText("€45.00")).toBeInTheDocument();

    // The citation is shown inline, resolved to a human label — not a raw ref.
    const card = screen.getByText(/Trim your food spending/).closest("li")!;
    await waitFor(() =>
      expect(within(card).getByText("Category: Food & drink")).toBeInTheDocument(),
    );
    expect(within(card).getByText("Discretionary spending")).toBeInTheDocument();
    // A grounded card is flagged as such — the distinction is machine-checkable.
    expect(card).toHaveAttribute("data-grounded", "true");
  });

  it("renders an unresolvable citation as visibly degraded, not identically to a grounded one", async () => {
    // The stat resolves, but the category id names nothing this client loaded —
    // so the whole card is degraded (invariant 5, the ticket's whole point).
    mockApi.getSuggestions.mockResolvedValue({
      suggestions: [suggestion({ sourceRefs: ["category:cat-ghost", "stat:discretionaryTotal"] })],
      nextCursor: null,
    });

    render(<SuggestionsSection />);

    const card = (await screen.findByText(/Trim your food spending/)).closest("li")!;
    await waitFor(() => expect(card).toHaveAttribute("data-grounded", "false"));
    // Degraded carries the amber accent, a grounded card the teal one — the two
    // never render identically (invariant 5).
    expect(card.className).toContain("border-l-amber");
    expect(within(card).getByText(/Grounding unavailable/)).toBeInTheDocument();
    // The missing grounding is shown, not hidden: the raw ref is surfaced.
    expect(within(card).getByText("category:cat-ghost")).toBeInTheDocument();
  });

  it("dismisses optimistically and keeps it dismissed when the server confirms", async () => {
    const user = userEvent.setup();
    mockApi.getSuggestions.mockResolvedValue({ suggestions: [suggestion()], nextCursor: null });
    mockApi.updateSuggestion.mockResolvedValue({
      suggestion: suggestion({ status: "dismissed" }),
    });

    render(<SuggestionsSection />);

    await user.click(await screen.findByRole("button", { name: "Dismiss" }));

    // Optimistic: the badge appears and the actions are gone immediately.
    expect(await screen.findByText("Dismissed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    expect(mockApi.updateSuggestion).toHaveBeenCalledWith("sug-1", { status: "dismissed" });
  });

  it("rolls back and surfaces the error when the update fails", async () => {
    const user = userEvent.setup();
    mockApi.getSuggestions.mockResolvedValue({ suggestions: [suggestion()], nextCursor: null });

    const pending = deferred<never>();
    mockApi.updateSuggestion.mockReturnValue(pending.promise);

    render(<SuggestionsSection />);

    await user.click(await screen.findByRole("button", { name: "Apply" }));

    // Optimistic first: the card shows "Applied" while the request is in flight.
    expect(await screen.findByText("Applied")).toBeInTheDocument();

    // Now fail it — the card must roll back to actionable, with the error shown.
    pending.reject(Object.assign(new Error("boom"), { userMessage: "Could not save that." }));

    expect(await screen.findByText("Could not save that.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.queryByText("Applied")).not.toBeInTheDocument();
  });

  it("wires refresh and surfaces the 429 rate-limit wait rather than a generic failure", async () => {
    const user = userEvent.setup();
    mockApi.getSuggestions.mockResolvedValue({ suggestions: [suggestion()], nextCursor: null });
    mockApi.refreshSuggestions.mockRejectedValue(
      Object.assign(new Error("429"), {
        userMessage: "You have used up your refresh budget. Try again in 2 minutes.",
      }),
    );

    render(<SuggestionsSection />);

    await user.click(await screen.findByRole("button", { name: "Refresh suggestions" }));

    expect(
      await screen.findByText("You have used up your refresh budget. Try again in 2 minutes."),
    ).toBeInTheDocument();
    expect(mockApi.refreshSuggestions).toHaveBeenCalledTimes(1);
  });

  it("replaces the feed with the refresh response", async () => {
    const user = userEvent.setup();
    mockApi.getSuggestions.mockResolvedValue({ suggestions: [suggestion()], nextCursor: null });
    mockApi.refreshSuggestions.mockResolvedValue({
      suggestions: [suggestion({ id: "sug-2", text: "Cancel your gym membership." })],
      nextCursor: null,
    });

    render(<SuggestionsSection />);

    await user.click(await screen.findByRole("button", { name: "Refresh suggestions" }));

    expect(await screen.findByText("Cancel your gym membership.")).toBeInTheDocument();
    expect(screen.queryByText(/Trim your food spending/)).not.toBeInTheDocument();
  });

  it("holds the cards until the grounding context settles, never flashing a grounded card as degraded", async () => {
    mockApi.getSuggestions.mockResolvedValue({ suggestions: [suggestion()], nextCursor: null });
    // Keep categories pending: the feed has arrived but the grounding cannot be
    // judged yet, so no card — grounded or degraded — may render.
    const pendingCats = deferred<{ categories: Category[] }>();
    mockApi.getCategories.mockReturnValue(pendingCats.promise);

    render(<SuggestionsSection />);

    // Held: the loading line is up and the suggestion is not on screen yet.
    expect(await screen.findByText("Loading suggestions…")).toBeInTheDocument();
    expect(screen.queryByText(/Trim your food spending/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Grounding unavailable/)).not.toBeInTheDocument();

    // Once categories resolve, the card renders grounded — it never showed degraded.
    pendingCats.resolve({ categories: CATEGORIES });
    const card = (await screen.findByText(/Trim your food spending/)).closest("li")!;
    expect(card).toHaveAttribute("data-grounded", "true");
  });

  it("names a grounding-context load failure rather than blaming the suggestions", async () => {
    mockApi.getSuggestions.mockResolvedValue({ suggestions: [suggestion()], nextCursor: null });
    // Categories fail to load: the trim suggestion's category ref can no longer
    // resolve, so it degrades — but the section says why.
    mockApi.getCategories.mockRejectedValue(
      Object.assign(new Error("boom"), { userMessage: "Could not load categories." }),
    );

    render(<SuggestionsSection />);

    expect(await screen.findByText(/Some supporting evidence couldn’t load/)).toBeInTheDocument();
    const card = screen.getByText(/Trim your food spending/).closest("li")!;
    expect(card).toHaveAttribute("data-grounded", "false");
  });

  it("recovers a failed grounding-context fetch via retry, without a page reload", async () => {
    const user = userEvent.setup();
    mockApi.getSuggestions.mockResolvedValue({
      suggestions: [suggestion({ sourceRefs: ["fixedExpense:exp-gym", "stat:recurringTotal"] })],
      nextCursor: null,
    });
    // Fixed expenses fail once, then succeed on retry.
    mockApi.listFixedExpenses
      .mockRejectedValueOnce(
        Object.assign(new Error("boom"), { userMessage: "Could not load your fixed expenses." }),
      )
      .mockResolvedValueOnce({ fixedExpenses: EXPENSES });

    render(<SuggestionsSection />);

    const card = (await screen.findByText(/Trim your food spending/)).closest("li")!;
    await waitFor(() => expect(card).toHaveAttribute("data-grounded", "false"));

    // Retry re-runs the evidence fetch; the fixedExpense ref now resolves.
    await user.click(screen.getByRole("button", { name: "Retry loading evidence" }));

    await waitFor(() => expect(card).toHaveAttribute("data-grounded", "true"));
    expect(screen.queryByText(/Some supporting evidence couldn’t load/)).not.toBeInTheDocument();
  });

  it("says the feed is truncated rather than silently dropping a non-null cursor", async () => {
    mockApi.getSuggestions.mockResolvedValue({ suggestions: [suggestion()], nextCursor: "cursor-2" });

    render(<SuggestionsSection />);

    expect(await screen.findByText(/Showing your most recent suggestions/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no suggestions", async () => {
    render(<SuggestionsSection />);
    expect(await screen.findByTestId("suggestions-empty")).toBeInTheDocument();
  });

  it("surfaces a load failure with a retry that does not spend the refresh budget", async () => {
    const user = userEvent.setup();
    mockApi.getSuggestions
      .mockRejectedValueOnce(
        Object.assign(new Error("boom"), { userMessage: "Could not load your suggestions." }),
      )
      .mockResolvedValueOnce({ suggestions: [suggestion()], nextCursor: null });

    render(<SuggestionsSection />);

    expect(await screen.findByText("Could not load your suggestions.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(/Trim your food spending/)).toBeInTheDocument();
    expect(mockApi.refreshSuggestions).not.toHaveBeenCalled();
  });
});
