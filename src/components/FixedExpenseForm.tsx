"use client";

// Create or edit a fixed expense (AC bullet 1) — rent, a subscription, anything
// recurring. Same money discipline as the transaction form: the amount is
// parsed to cents exactly once on submit, the raw string is what lives in state.

import { useState } from "react";
import type { FormEvent } from "react";
import type {
  Cadence,
  Category,
  CreateFixedExpenseBody,
  FixedExpense,
  UpdateFixedExpenseBody,
} from "../api/contract";
import { centsToAmountInput, parseAmountToCents } from "../money/parseAmount";
import { toFormErrors } from "../api/fieldErrors";
import { Field } from "./Field";
import { CategorySelect } from "./CategorySelect";

const DEFAULT_CURRENCY = "EUR";

// A record over `Cadence` rather than a bare array: a new variant on the union
// makes this a compile error (a missing key) instead of a select that silently
// omits an option. This is the "pin the list to its source" the checklist asks
// for, enforced at build time rather than by a test.
const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};
const CADENCES = Object.keys(CADENCE_LABELS) as Cadence[];

interface Values {
  label: string;
  amount: string;
  currency: string;
  categoryId: string;
  cadence: Cadence;
}

function initialValues(initial?: FixedExpense): Values {
  if (!initial) {
    return { label: "", amount: "", currency: DEFAULT_CURRENCY, categoryId: "", cadence: "monthly" };
  }
  return {
    label: initial.label,
    // Stored cents shown back as a decimal for editing; re-parsed on submit.
    amount: centsToAmountInput(initial.money.amountCents),
    currency: initial.money.currency,
    categoryId: initial.categoryId,
    cadence: initial.cadence,
  };
}

export function FixedExpenseForm({
  mode,
  initial,
  categories,
  categoriesLoading,
  categoriesError,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: FixedExpense;
  categories: Category[];
  categoriesLoading: boolean;
  categoriesError: string | null;
  onSubmit: (body: CreateFixedExpenseBody | UpdateFixedExpenseBody) => Promise<void>;
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

    const parsed = parseAmountToCents(values.amount);
    if (!parsed.ok || parsed.cents === undefined) {
      setFieldErrors({ amountCents: parsed.ok ? "Enter an amount." : parsed.reason });
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const body = {
        label: values.label.trim(),
        categoryId: values.categoryId,
        amountCents: parsed.cents,
        currency: values.currency.trim().toUpperCase(),
        cadence: values.cadence,
      };
      await onSubmit(body);
    } catch (cause) {
      const { fields, form } = toFormErrors(cause);
      setFieldErrors(fields);
      setFormError(form);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label={mode === "create" ? "Add a fixed expense" : "Edit fixed expense"}>
      <Field id="fe-label" label="Label" error={fieldErrors.label}>
        {(props) => (
          <input {...props} placeholder="Rent" value={values.label} onChange={(event) => set("label", event.target.value)} />
        )}
      </Field>

      <Field id="fe-amount" label="Amount" error={fieldErrors.amountCents}>
        {(props) => (
          <input
            {...props}
            inputMode="decimal"
            autoComplete="off"
            placeholder="950.00"
            value={values.amount}
            onChange={(event) => set("amount", event.target.value)}
          />
        )}
      </Field>

      <Field id="fe-currency" label="Currency" error={fieldErrors.currency}>
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
        id="fe-categoryId"
        categories={categories}
        loading={categoriesLoading}
        loadError={categoriesError}
        value={values.categoryId}
        error={fieldErrors.categoryId}
        onChange={(id) => set("categoryId", id)}
      />

      <Field id="fe-cadence" label="Cadence" error={fieldErrors.cadence}>
        {(props) => (
          <select {...props} value={values.cadence} onChange={(event) => set("cadence", event.target.value as Cadence)}>
            {CADENCES.map((cadence) => (
              <option key={cadence} value={cadence}>
                {CADENCE_LABELS[cadence]}
              </option>
            ))}
          </select>
        )}
      </Field>

      {formError ? (
        <p role="alert" data-testid="form-error" className="field-error">
          {formError}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : mode === "create" ? "Add fixed expense" : "Save changes"}
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
