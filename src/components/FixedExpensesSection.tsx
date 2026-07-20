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
import { useCategories } from "../hooks/useCategories";
import { formatMoney } from "../money/formatMoney";
import { FixedExpenseForm } from "./FixedExpenseForm";

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

export function FixedExpensesSection() {
  const { categories, loading: categoriesLoading, error: categoriesError } = useCategories();
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
        setList({ status: "error", message: userMessageOf(cause, "Could not load your fixed expenses.") });
      });
    return () => controller.abort();
  }, []);

  const labelFor = useMemo(() => categoryLabeller(categories), [categories]);

  function replace(updated: FixedExpense) {
    setList((prev) =>
      prev.status === "ready"
        ? { status: "ready", expenses: prev.expenses.map((e) => (e.id === updated.id ? updated : e)) }
        : prev,
    );
  }

  async function handleCreate(body: CreateFixedExpenseBody | UpdateFixedExpenseBody) {
    const { fixedExpense } = await api.createFixedExpense(body as CreateFixedExpenseBody);
    setList((prev) =>
      prev.status === "ready" ? { status: "ready", expenses: [fixedExpense, ...prev.expenses] } : prev,
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
      <div className="section-head">
        <h2 id="fixed-expenses-heading">Fixed expenses</h2>
        {!creating ? (
          <button type="button" onClick={() => setCreating(true)}>
            Add fixed expense
          </button>
        ) : null}
      </div>

      {creating ? (
        <FixedExpenseForm
          mode="create"
          categories={categories}
          categoriesLoading={categoriesLoading}
          categoriesError={categoriesError}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {list.status === "loading" ? <p aria-live="polite">Loading fixed expenses…</p> : null}
      {list.status === "error" ? (
        <p role="alert" className="field-error">
          {list.message}
        </p>
      ) : null}

      {list.status === "ready" && list.expenses.length === 0 ? (
        <p data-testid="fixed-expenses-empty">No fixed expenses yet.</p>
      ) : null}

      {list.status === "ready" && list.expenses.length > 0 ? (
        <ul className="ledger-list">
          {list.expenses.map((expense) =>
            editingId === expense.id ? (
              <li key={expense.id}>
                <FixedExpenseForm
                  mode="edit"
                  initial={expense}
                  categories={categories}
                  categoriesLoading={categoriesLoading}
                  categoriesError={categoriesError}
                  onSubmit={(body) => handleEdit(expense.id, body)}
                  onCancel={() => setEditingId(null)}
                />
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
    <li className={expense.active ? "ledger-row" : "ledger-row ledger-row-inactive"}>
      <span className="ledger-label">{expense.label}</span>
      <span className="ledger-amount">{formatMoney(expense.money)}</span>
      <span className="ledger-cadence">{expense.cadence}</span>
      <span className="ledger-category">{categoryLabel}</span>
      {!expense.active ? <span className="ledger-badge">Inactive</span> : null}
      <div className="ledger-actions">
        <button type="button" onClick={onEdit} disabled={busy}>
          Edit
        </button>
        <button type="button" onClick={toggleActive} disabled={busy}>
          {busy ? "Working…" : expense.active ? "Deactivate" : "Reactivate"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="field-error">
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
