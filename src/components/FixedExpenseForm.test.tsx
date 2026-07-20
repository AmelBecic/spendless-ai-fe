import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FixedExpenseForm } from "./FixedExpenseForm";
import { ApiError } from "../api/client";
import type { Category } from "../api/contract";

const CATEGORIES: Category[] = [{ id: "cat-housing", key: "housing", label: "Housing" }];

function renderForm(overrides: Partial<Parameters<typeof FixedExpenseForm>[0]> = {}) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  render(
    <FixedExpenseForm
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

describe("FixedExpenseForm", () => {
  it("sends label, integer cents, currency, category and cadence", async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Label"), "Rent");
    await user.type(screen.getByLabelText("Amount"), "950");
    await user.selectOptions(screen.getByLabelText("Category"), "cat-housing");
    await user.selectOptions(screen.getByLabelText("Cadence"), "monthly");
    await user.click(screen.getByRole("button", { name: "Add fixed expense" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      label: "Rent",
      amountCents: 95000,
      currency: "EUR",
      categoryId: "cat-housing",
      cadence: "monthly",
    });
  });

  it("renders a backend 400 on the label against the label field", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        status: 400,
        code: "VALIDATION_FAILED",
        message: "Validation failed",
        fromEnvelope: true,
        details: [{ path: "label", message: "You already have a fixed expense with this label." }],
      }),
    );
    renderForm({ onSubmit });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Label"), "Rent");
    await user.type(screen.getByLabelText("Amount"), "950");
    await user.selectOptions(screen.getByLabelText("Category"), "cat-housing");
    await user.click(screen.getByRole("button", { name: "Add fixed expense" }));

    const label = screen.getByLabelText("Label");
    await waitFor(() => expect(label).toHaveAttribute("aria-invalid", "true"));
    const describedBy = label.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)).toHaveTextContent("already have a fixed expense");
  });

  it("rejects an over-precise amount without submitting", async () => {
    const { onSubmit } = renderForm();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Label"), "Gym");
    await user.type(screen.getByLabelText("Amount"), "29.999");
    await user.selectOptions(screen.getByLabelText("Category"), "cat-housing");
    await user.click(screen.getByRole("button", { name: "Add fixed expense" }));

    expect(await screen.findByText(/at most 2 decimal places/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
