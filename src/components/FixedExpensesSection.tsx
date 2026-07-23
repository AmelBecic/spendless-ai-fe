"use client";

// Owns the fixed-expense list and its create/edit/deactivate flow (AC bullet 1).
// "Delete" here is the backend's soft deactivate: DELETE returns the updated row
// with `active: false` rather than a 204, so the row stays on screen marked
// inactive and can be reactivated — nothing is destroyed.

import { useEffect, useMemo, useState } from "react";
import type {
  Category,
  CreateFixedExpenseBody,
  FixedExpense,
  UpdateFixedExpenseBody,
} from "../api/contract";
import { api } from "../api/client";
import { formatMoney } from "../money/formatMoney";
import { FixedExpenseForm } from "./FixedExpenseForm";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; expenses: FixedExpense[] };

function userMessageOf(cause: unknown, fallback: string): string {
  if (typeof (cause as { userMessage?: unknown })?.userMessage === "string") {
    return (cause as { userMessage: string }).userMessage;
  }
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function FixedExpensesSection({
  categories,
  categoriesLoading,
  categoriesError,
}: {
  // Shared from the screen level — see TransactionsSection for the rationale.
  categories: Category[];
  categoriesLoading: boolean;
  categoriesError: string | null;
}) {
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    // Runs once on mount; `list` already starts in the loading state.
    const controller = new AbortController();
    api
      .listFixedExpenses({}, controller.signal)
      .then((res) => setList({ status: "ready", expenses: res.fixedExpenses }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setList({
          status: "error",
          message: userMessageOf(cause, "Could not load your fixed expenses."),
        });
      });
    return () => controller.abort();
  }, []);

  const labelFor = useMemo(() => categoryLabeller(categories), [categories]);

  function replace(updated: FixedExpense) {
    setList((prev) =>
      prev.status === "ready"
        ? {
            status: "ready",
            expenses: prev.expenses.map((e) => (e.id === updated.id ? updated : e)),
          }
        : prev,
    );
  }

  async function handleCreate(body: CreateFixedExpenseBody | UpdateFixedExpenseBody) {
    const { fixedExpense } = await api.createFixedExpense(body as CreateFixedExpenseBody);
    setList((prev) =>
      prev.status === "ready"
        ? { status: "ready", expenses: [fixedExpense, ...prev.expenses] }
        : prev,
    );
    setCreating(false);
  }

  async function handleEdit(id: string, body: CreateFixedExpenseBody | UpdateFixedExpenseBody) {
    const { fixedExpense } = await api.updateFixedExpense(id, body as UpdateFixedExpenseBody);
    replace(fixedExpense);
    setEditingId(null);
  }

  return (
    <section aria-labelledby="fixed-expenses-heading">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id="fixed-expenses-heading" className="font-display text-lg font-semibold text-ink">
          Fixed expenses
        </h2>
        {!creating ? (
          <Button type="button" variant="subtle" size="sm" onClick={() => setCreating(true)}>
            Add fixed expense
          </Button>
        ) : null}
      </div>

      {creating ? (
        <Card className="mb-4">
          <CardContent className="pt-5">
            <FixedExpenseForm
              mode="create"
              categories={categories}
              categoriesLoading={categoriesLoading}
              categoriesError={categoriesError}
              onSubmit={handleCreate}
              onCancel={() => setCreating(false)}
            />
          </CardContent>
        </Card>
      ) : null}

      {list.status === "loading" ? (
        <p aria-live="polite" className="text-sm text-muted">
          Loading fixed expenses…
        </p>
      ) : null}
      {list.status === "error" ? (
        <p role="alert" className="text-sm text-coral-ink">
          {list.message}
        </p>
      ) : null}

      {list.status === "ready" && list.expenses.length === 0 ? (
        <p data-testid="fixed-expenses-empty" className="text-sm text-muted">
          No fixed expenses yet.
        </p>
      ) : null}

      {list.status === "ready" && list.expenses.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {list.expenses.map((expense) =>
            editingId === expense.id ? (
              <li key={expense.id}>
                <Card>
                  <CardContent className="pt-5">
                    <FixedExpenseForm
                      mode="edit"
                      initial={expense}
                      categories={categories}
                      categoriesLoading={categoriesLoading}
                      categoriesError={categoriesError}
                      onSubmit={(body) => handleEdit(expense.id, body)}
                      onCancel={() => setEditingId(null)}
                    />
                  </CardContent>
                </Card>
              </li>
            ) : (
              <FixedExpenseRow
                key={expense.id}
                expense={expense}
                categoryLabel={labelFor(expense.categoryId)}
                onEdit={() => setEditingId(expense.id)}
                onToggled={replace}
              />
            ),
          )}
        </ul>
      ) : null}
    </section>
  );
}

function FixedExpenseRow({
  expense,
  categoryLabel,
  onEdit,
  onToggled,
}: {
  expense: FixedExpense;
  categoryLabel: string;
  onEdit: () => void;
  onToggled: (updated: FixedExpense) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive() {
    setError(null);
    setBusy(true);
    try {
      // Deactivate is the soft DELETE; reactivate is a PATCH with `active: true`.
      const { fixedExpense } = expense.active
        ? await api.deleteFixedExpense(expense.id)
        : await api.updateFixedExpense(expense.id, { active: true });
      onToggled(fixedExpense);
    } catch (cause) {
      setError(userMessageOf(cause, "Could not update this fixed expense."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border border-line bg-surface px-4 py-3 ${
        expense.active ? "" : "opacity-60"
      }`}
    >
      <span className="font-medium text-ink">{expense.label}</span>
      <span className="font-display font-semibold tabular-nums text-ink">
        {formatMoney(expense.money)}
      </span>
      <span className="text-sm text-muted">{expense.cadence}</span>
      <span className="text-sm text-muted">{categoryLabel}</span>
      {!expense.active ? (
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted">
          Inactive
        </span>
      ) : null}
      <div className="ml-auto flex gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={busy}>
          Edit
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={toggleActive} disabled={busy}>
          {busy ? "Working…" : expense.active ? "Deactivate" : "Reactivate"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="w-full text-sm text-coral-ink">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function categoryLabeller(categories: Category[]): (id: string) => string {
  const byId = new Map(categories.map((c) => [c.id, c.label]));
  return (id) => byId.get(id) ?? id;
}
