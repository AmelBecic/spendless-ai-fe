import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, Transaction } from "../api/contract";

// The list goes through the shared client; stub it rather than hit a backend.
vi.mock("../api/client", () => ({
  api: {
    listTransactions: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  },
}));

const CATEGORIES: Category[] = [{ id: "cat-groceries", key: "groceries", label: "Groceries" }];
vi.mock("../hooks/useCategories", () => ({
  useCategories: () => ({ categories: CATEGORIES, loading: false, error: null }),
}));

import { api } from "../api/client";
import { TransactionsSection } from "./TransactionsSection";

const mockApi = vi.mocked(api);

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "txn-1",
    userId: "user-1",
    money: { amountCents: 1899, currency: "EUR" },
    categoryId: "cat-groceries",
    occurredAt: "2026-07-10T12:00:00.000Z",
    createdAt: "2026-07-10T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TransactionsSection", () => {
  it("renders each transaction's amount verbatim, formatted from the API row", async () => {
    mockApi.listTransactions.mockResolvedValue({
      transactions: [txn({ id: "txn-1", money: { amountCents: 1899, currency: "EUR" } })],
      nextCursor: null,
    });

    render(<TransactionsSection />);

    expect(await screen.findByText("€18.99")).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();
  });

  it("shows an explicit empty state rather than a zero row", async () => {
    mockApi.listTransactions.mockResolvedValue({ transactions: [], nextCursor: null });

    render(<TransactionsSection />);

    expect(await screen.findByTestId("transactions-empty")).toBeInTheDocument();
  });

  it("removes a row after a successful delete", async () => {
    mockApi.listTransactions.mockResolvedValue({ transactions: [txn()], nextCursor: null });
    mockApi.deleteTransaction.mockResolvedValue(undefined as never);

    render(<TransactionsSection />);
    expect(await screen.findByText("€18.99")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("€18.99")).not.toBeInTheDocument());
    expect(mockApi.deleteTransaction).toHaveBeenCalledWith("txn-1");
  });

  it("surfaces a load failure instead of an empty list", async () => {
    mockApi.listTransactions.mockRejectedValue(
      Object.assign(new Error("boom"), { userMessage: "Could not load your transactions." }),
    );

    render(<TransactionsSection />);

    expect(await screen.findByText("Could not load your transactions.")).toBeInTheDocument();
  });
});
