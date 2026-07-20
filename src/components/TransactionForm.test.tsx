import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransactionForm } from "./TransactionForm";
import { ApiError } from "../api/client";
import type { Category, Transaction } from "../api/contract";

const CATEGORIES: Category[] = [
  { id: "cat-groceries", key: "groceries", label: "Groceries" },
  { id: "cat-transport", key: "transport", label: "Transport" },
];

function renderForm(overrides: Partial<Parameters<typeof TransactionForm>[0]> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  render(
    <TransactionForm
      mode="create"
      categories={CATEGORIES}
      categoriesLoading={false}
      categoriesError={null}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onSubmit };
}

async function fillAmountAndCategory(amount: string) {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Amount"));
  await user.type(screen.getByLabelText("Amount"), amount);
  await user.selectOptions(screen.getByLabelText("Category"), "cat-groceries");
  return user;
}

describe("TransactionForm", () => {
  it("parses the amount to integer cents exactly once, on submit", async () => {
    const { onSubmit } = renderForm();
    const user = await fillAmountAndCategory("12.5");

    await user.click(screen.getByRole("button", { name: "Log transaction" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 1250, currency: "EUR", categoryId: "cat-groceries" }),
    );
  });

  it("rejects an over-precise amount against the amount field, without submitting", async () => {
    const { onSubmit } = renderForm();
    const user = await fillAmountAndCategory("12.345");

    await user.click(screen.getByRole("button", { name: "Log transaction" }));

    expect(await screen.findByText(/at most 2 decimal places/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders a backend 400 against the offending field, not as a form banner", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        fromEnvelope: true,
        details: [{ path: "amountCents", message: "That category caps single spends at €100." }],
      }),
    );
    renderForm({ onSubmit });
    const user = await fillAmountAndCategory("250");

    await user.click(screen.getByRole("button", { name: "Log transaction" }));

    // The message lands in the amount field's error slot (wired via
    // aria-describedby), and there is no separate form-level banner.
    const amount = screen.getByLabelText("Amount");
    await waitFor(() => expect(amount).toHaveAttribute("aria-invalid", "true"));
    const describedBy = amount.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent("caps single spends");
    expect(screen.queryByTestId("form-error")).not.toBeInTheDocument();
  });

  it("lands a nested `money.currency` 400 on the currency field", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        fromEnvelope: true,
        details: [{ path: "money.currency", message: "That currency is not supported." }],
      }),
    );
    renderForm({ onSubmit });
    const user = await fillAmountAndCategory("10");

    await user.click(screen.getByRole("button", { name: "Log transaction" }));

    const currency = screen.getByLabelText("Currency");
    await waitFor(() => expect(currency).toHaveAttribute("aria-invalid", "true"));
    const describedBy = currency.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)).toHaveTextContent("not supported");
  });

  it("omits merchant, note and occurredAt from the body when left empty", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ onSubmit });
    const user = await fillAmountAndCategory("40");

    await user.click(screen.getByRole("button", { name: "Log transaction" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const body = onSubmit.mock.calls[0]![0];
    expect(body).not.toHaveProperty("merchant");
    expect(body).not.toHaveProperty("note");
    expect(body).not.toHaveProperty("occurredAt");
  });

  it("prefills from an existing transaction and re-parses its amount on submit", async () => {
    const existing: Transaction = {
      id: "txn-1",
      userId: "user-1",
      money: { amountCents: 1899, currency: "USD" },
      categoryId: "cat-transport",
      merchant: "Metro",
      occurredAt: "2026-07-01T09:30:00.000Z",
      createdAt: "2026-07-01T09:30:00.000Z",
    };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ mode: "edit", initial: existing, onSubmit });

    expect(screen.getByLabelText("Amount")).toHaveValue("18.99");
    expect(screen.getByLabelText("Merchant")).toHaveValue("Metro");

    await userEvent.setup().click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1899, currency: "USD" }));
  });
});
