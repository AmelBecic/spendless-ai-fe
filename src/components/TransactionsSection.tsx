"use client";

// Owns the transaction list and the create/edit/delete flow around it (AC
// bullet 1). Data comes through `api` (invariant 3); every figure on screen —
// each amount — is rendered from the row the API returned, formatted only at
// render (invariants 1 & 2). Rows are keyed by id, so dismissing one never
// reorders the rest.

import { useEffect, useMemo, useState } from "react";
import type {
  Category,
  CreateTransactionBody,
  Transaction,
  UpdateTransactionBody,
} from "../api/contract";
import { api } from "../api/client";
import { formatMoney } from "../money/formatMoney";
import { TransactionForm } from "./TransactionForm";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; transactions: Transaction[] };

function userMessageOf(cause: unknown, fallback: string): string {
  if (typeof (cause as { userMessage?: unknown })?.userMessage === "string") {
    return (cause as { userMessage: string }).userMessage;
  }
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function TransactionsSection({
  categories,
  categoriesLoading,
  categoriesError,
}: {
  // The category list is fetched once at the screen level and shared, rather
  // than re-fetched here — both sections need the same immutable list.
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
      .listTransactions({}, controller.signal)
      .then((res) => setList({ status: "ready", transactions: res.transactions }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setList({
          status: "error",
          message: userMessageOf(cause, "Could not load your transactions."),
        });
      });
    return () => controller.abort();
  }, []);

  const labelFor = useMemo(() => categoryLabeller(categories), [categories]);

  async function handleCreate(body: CreateTransactionBody | UpdateTransactionBody) {
    const { transaction } = await api.createTransaction(body as CreateTransactionBody);
    setList((prev) =>
      prev.status === "ready"
        ? { status: "ready", transactions: [transaction, ...prev.transactions] }
        : prev,
    );
    setCreating(false);
  }

  async function handleEdit(id: string, body: CreateTransactionBody | UpdateTransactionBody) {
    const { transaction } = await api.updateTransaction(id, body as UpdateTransactionBody);
    setList((prev) =>
      prev.status === "ready"
        ? {
            status: "ready",
            transactions: prev.transactions.map((t) => (t.id === id ? transaction : t)),
          }
        : prev,
    );
    setEditingId(null);
  }

  return (
    <section aria-labelledby="transactions-heading" className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id="transactions-heading" className="font-display text-lg font-semibold text-ink">
          Daily spend
        </h2>
        {!creating ? (
          <Button type="button" variant="subtle" size="sm" onClick={() => setCreating(true)}>
            Log transaction
          </Button>
        ) : null}
      </div>

      {creating ? (
        <Card className="mb-4">
          <CardContent className="pt-5">
            <TransactionForm
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
          Loading transactions…
        </p>
      ) : null}
      {list.status === "error" ? (
        <p role="alert" className="text-sm text-coral-ink">
          {list.message}
        </p>
      ) : null}

      {list.status === "ready" && list.transactions.length === 0 ? (
        // An explicit empty state, not a zero row: "nothing logged yet" is the
        // truth; a €0.00 line would read as a spend that happened.
        <p data-testid="transactions-empty" className="text-sm text-muted">
          No transactions logged yet.
        </p>
      ) : null}

      {list.status === "ready" && list.transactions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {list.transactions.map((transaction) =>
            editingId === transaction.id ? (
              <li key={transaction.id}>
                <Card>
                  <CardContent className="pt-5">
                    <TransactionForm
                      mode="edit"
                      initial={transaction}
                      categories={categories}
                      categoriesLoading={categoriesLoading}
                      categoriesError={categoriesError}
                      onSubmit={(body) => handleEdit(transaction.id, body)}
                      onCancel={() => setEditingId(null)}
                    />
                  </CardContent>
                </Card>
              </li>
            ) : (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                categoryLabel={labelFor(transaction.categoryId)}
                onEdit={() => setEditingId(transaction.id)}
                onDeleted={() =>
                  setList((prev) =>
                    prev.status === "ready"
                      ? {
                          status: "ready",
                          transactions: prev.transactions.filter((t) => t.id !== transaction.id),
                        }
                      : prev,
                  )
                }
              />
            ),
          )}
        </ul>
      ) : null}
    </section>
  );
}

function TransactionRow({
  transaction,
  categoryLabel,
  onEdit,
  onDeleted,
}: {
  transaction: Transaction;
  categoryLabel: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      await api.deleteTransaction(transaction.id);
      onDeleted();
    } catch (cause) {
      setError(userMessageOf(cause, "Could not delete this transaction."));
      setDeleting(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-tile border border-line bg-surface px-4 py-3">
      <span className="font-display font-semibold tabular-nums text-ink">
        {formatMoney(transaction.money)}
      </span>
      <span className="text-sm text-muted">{categoryLabel}</span>
      {transaction.merchant ? (
        <span className="text-sm text-ink">{transaction.merchant}</span>
      ) : null}
      <time dateTime={transaction.occurredAt} className="text-sm text-muted">
        {formatDate(transaction.occurredAt)}
      </time>
      <div className="ml-auto flex gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={deleting}>
          Edit
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete"}
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

/** Resolve a category id to its label, falling back to the id if the list has
 * not loaded (or the id is unknown) rather than rendering a blank. */
function categoryLabeller(categories: Category[]): (id: string) => string {
  const byId = new Map(categories.map((c) => [c.id, c.label]));
  return (id) => byId.get(id) ?? id;
}

/** ISO instant → a date in the viewer's locale and zone. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}
