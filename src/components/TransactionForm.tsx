"use client";

// Create or edit a single transaction (AC bullet 1). One component covers both:
// the fields are identical, only the initial values and the body shape differ
// (create sends the full row; edit sends a partial PATCH).
//
// The amount is parsed to cents exactly once, here, on submit — the edge where
// the value leaves the form for the API (invariant 1). The raw string is what
// lives in state; no `parseFloat`, and nothing fractional is ever stored.

import { useState } from "react";
import type { FormEvent } from "react";
import type {
  Category,
  CreateTransactionBody,
  Transaction,
  UpdateTransactionBody,
} from "../api/contract";
import { centsToAmountInput, parseAmountToCents } from "../money/parseAmount";
import { toFormErrors } from "../api/fieldErrors";
import { Field } from "./Field";
import { CategorySelect } from "./CategorySelect";

/** Default currency for a new row. The app is single-currency per user today;
 * the field stays editable because the backend accepts any ISO-4217 code. */
const DEFAULT_CURRENCY = "EUR";

/** The fields this form renders — a backend 400 on any other path is surfaced
 * at form level rather than dropped (see toFormErrors). */
const KNOWN_FIELDS = ["amountCents", "currency", "categoryId", "merchant", "note", "occurredAt"] as const;

interface Values {
  amount: string;
  currency: string;
  categoryId: string;
  merchant: string;
  note: string;
  /** `datetime-local` value (local wall time, no zone) or "". */
  occurredAt: string;
}

function initialValues(initial?: Transaction): Values {
  if (!initial) {
    return { amount: "", currency: DEFAULT_CURRENCY, categoryId: "", merchant: "", note: "", occurredAt: "" };
  }
  return {
    // Editing shows the stored cents back as a decimal for the user; this is a
    // render, not state arithmetic — the value re-parses to cents on submit.
    amount: centsToAmountInput(initial.money.amountCents),
    currency: initial.money.currency,
    categoryId: initial.categoryId,
    merchant: initial.merchant ?? "",
    note: initial.note ?? "",
    occurredAt: toLocalInput(initial.occurredAt),
  };
}

/** ISO instant → the `datetime-local` value in the viewer's zone. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function TransactionForm({
  mode,
  initial,
  categories,
  categoriesLoading,
  categoriesError,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: Transaction;
  categories: Category[];
  categoriesLoading: boolean;
  categoriesError: string | null;
  /** Sends the body; rejects with the client's `ApiError` on a backend failure. */
  onSubmit: (body: CreateTransactionBody | UpdateTransactionBody) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<Values>(() => initialValues(initial));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Parse the amount at the edge. A local validation failure lands on the same
    // field slot a backend 400 on `amountCents` would.
    const parsed = parseAmountToCents(values.amount);
    if (!parsed.ok || parsed.cents === undefined) {
      setFieldErrors({ amountCents: parsed.ok ? "Enter an amount." : parsed.reason });
      return;
    }

    const occurredAt = values.occurredAt.trim();
    let occurredAtIso: string | undefined;
    if (occurredAt) {
      const date = new Date(occurredAt);
      if (Number.isNaN(date.getTime())) {
        setFieldErrors({ occurredAt: "Enter a valid date and time." });
        return;
      }
      // A proper instant with a `Z` designator — never a sliced local string,
      // which the backend rejects for being zone-ambiguous.
      occurredAtIso = date.toISOString();
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      await onSubmit(buildBody(mode, values, parsed.cents, occurredAtIso));
    } catch (cause) {
      const { fields, form } = toFormErrors(cause, KNOWN_FIELDS);
      setFieldErrors(fields);
      setFormError(form);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label={mode === "create" ? "Log a transaction" : "Edit transaction"}>
      <Field id="amount" label="Amount" error={fieldErrors.amountCents}>
        {(props) => (
          <input
            {...props}
            inputMode="decimal"
            autoComplete="off"
            placeholder="12.50"
            value={values.amount}
            onChange={(event) => set("amount", event.target.value)}
          />
        )}
      </Field>

      <Field id="currency" label="Currency" error={fieldErrors.currency}>
        {(props) => (
          <input
            {...props}
            maxLength={3}
            autoCapitalize="characters"
            value={values.currency}
            onChange={(event) => set("currency", event.target.value.toUpperCase())}
          />
        )}
      </Field>

      <CategorySelect
        categories={categories}
        loading={categoriesLoading}
        loadError={categoriesError}
        value={values.categoryId}
        error={fieldErrors.categoryId}
        onChange={(id) => set("categoryId", id)}
      />

      <Field id="merchant" label="Merchant" error={fieldErrors.merchant}>
        {(props) => (
          <input {...props} value={values.merchant} onChange={(event) => set("merchant", event.target.value)} />
        )}
      </Field>

      <Field id="note" label="Note" error={fieldErrors.note}>
        {(props) => (
          <input {...props} value={values.note} onChange={(event) => set("note", event.target.value)} />
        )}
      </Field>

      <Field id="occurredAt" label="When" error={fieldErrors.occurredAt}>
        {(props) => (
          <input
            {...props}
            type="datetime-local"
            value={values.occurredAt}
            onChange={(event) => set("occurredAt", event.target.value)}
          />
        )}
      </Field>

      {formError ? (
        <p role="alert" data-testid="form-error" className="field-error">
          {formError}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : mode === "create" ? "Log transaction" : "Save changes"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Build the wire body. On edit, `merchant`/`note` are sent as `null` when
 * cleared (the contract's omitted-leaves / null-clears distinction) so a user
 * can actually remove a merchant.
 */
function buildBody(
  mode: "create" | "edit",
  values: Values,
  amountCents: number,
  occurredAt: string | undefined,
): CreateTransactionBody | UpdateTransactionBody {
  const merchant = values.merchant.trim();
  const note = values.note.trim();

  if (mode === "create") {
    const body: CreateTransactionBody = {
      amountCents,
      currency: values.currency.trim().toUpperCase(),
      categoryId: values.categoryId,
    };
    if (merchant) body.merchant = merchant;
    if (note) body.note = note;
    if (occurredAt) body.occurredAt = occurredAt;
    return body;
  }

  return {
    amountCents,
    currency: values.currency.trim().toUpperCase(),
    categoryId: values.categoryId,
    merchant: merchant === "" ? null : merchant,
    note: note === "" ? null : note,
    ...(occurredAt ? { occurredAt } : {}),
  };
}
