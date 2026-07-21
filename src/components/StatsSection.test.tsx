import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, SpendStats } from "../api/contract";
import type { Period } from "../dates/periods";

// Stats come through the shared client; stub it rather than hit a backend.
vi.mock("../api/client", () => ({
  api: { getStats: vi.fn() },
}));

import { api } from "../api/client";
import { StatsSection } from "./StatsSection";

const mockApi = vi.mocked(api);

const CATEGORIES: Category[] = [
  { id: "cat-groceries", key: "groceries", label: "Groceries" },
  { id: "cat-rent", key: "rent", label: "Rent" },
];

const THIS_MONTH: Period = { id: "this-month", label: "This month", from: "2026-07-01", to: "2026-07-21" };
const LAST_7: Period = { id: "last-7", label: "Last 7 days", from: "2026-07-15", to: "2026-07-21" };

// Every figure below is distinct, so a rendered value can only have come from
// the field it was read from — no coincidental match hides a wrong wiring.
function stats(overrides: Partial<SpendStats> = {}): SpendStats {
  return {
    periodStart: "2026-07-01",
    periodEnd: "2026-07-21",
    currency: "EUR",
    total: { amountCents: 12345, currency: "EUR" },
    byCategory: [{ categoryId: "cat-groceries", total: { amountCents: 6789, currency: "EUR" }, share: 0.55 }],
    topCategories: [{ categoryId: "cat-rent", total: { amountCents: 9900, currency: "EUR" }, share: 0.8 }],
    recurringTotal: { amountCents: 8000, currency: "EUR" },
    discretionaryTotal: { amountCents: 4321, currency: "EUR" },
    dailyAverage: { amountCents: 411, currency: "EUR" },
    weeklyAverage: { amountCents: 2877, currency: "EUR" },
    momDeltaCents: -1599,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StatsSection", () => {
  it("renders every figure verbatim, formatted from the API response", async () => {
    mockApi.getStats.mockResolvedValue({ stats: stats() });

    render(<StatsSection period={THIS_MONTH} categories={CATEGORIES} />);

    expect(await screen.findByText("€123.45")).toBeInTheDocument(); // total
    expect(screen.getByText("€80.00")).toBeInTheDocument(); // recurring
    expect(screen.getByText("€43.21")).toBeInTheDocument(); // discretionary
    expect(screen.getByText("€4.11")).toBeInTheDocument(); // daily average
    expect(screen.getByText("€28.77")).toBeInTheDocument(); // weekly average
    expect(screen.getByText("-€15.99")).toBeInTheDocument(); // momDelta, sign intact
    // Per-category rows: total + share, with the category labelled.
    expect(screen.getByText("€67.89")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    // Top categories list, distinct from the full breakdown.
    expect(screen.getByText("€99.00")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Rent")).toBeInTheDocument();
  });

  it("sends the selected period's from/to and refetches when it changes", async () => {
    mockApi.getStats.mockResolvedValue({ stats: stats() });

    const { rerender } = render(<StatsSection period={THIS_MONTH} categories={CATEGORIES} />);

    await waitFor(() =>
      expect(mockApi.getStats).toHaveBeenCalledWith({ from: "2026-07-01", to: "2026-07-21" }, expect.anything()),
    );

    rerender(<StatsSection period={LAST_7} categories={CATEGORIES} />);

    await waitFor(() =>
      expect(mockApi.getStats).toHaveBeenCalledWith({ from: "2026-07-15", to: "2026-07-21" }, expect.anything()),
    );
  });

  it("shows an explicit empty state rather than a grid of zeros", async () => {
    mockApi.getStats.mockResolvedValue({ stats: stats({ byCategory: [], topCategories: [] }) });

    render(<StatsSection period={THIS_MONTH} categories={CATEGORIES} />);

    expect(await screen.findByTestId("stats-empty")).toBeInTheDocument();
    // A €0.00 tile would read as a spend that happened — it must not appear.
    expect(screen.queryByText("€0.00")).not.toBeInTheDocument();
  });

  it("surfaces a load failure instead of a blank grid", async () => {
    mockApi.getStats.mockRejectedValue(
      Object.assign(new Error("boom"), { userMessage: "That window is too wide to aggregate." }),
    );

    render(<StatsSection period={THIS_MONTH} categories={CATEGORIES} />);

    expect(await screen.findByText("That window is too wide to aggregate.")).toBeInTheDocument();
  });
});
