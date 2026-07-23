"use client";

// The category select both forms share, fed by `GET /categories` (AC bullet 3).
// It renders its own loading / error / ready states rather than assuming the
// list is there — a fresh account hitting a cold backend sees the difference.

import { Field } from "./Field";
import { Select } from "./ui/select";
import { Label } from "./ui/label";
import type { Category } from "../api/contract";

export function CategorySelect({
  id = "categoryId",
  label = "Category",
  categories,
  loading,
  loadError,
  value,
  error,
  onChange,
}: {
  id?: string;
  label?: string;
  categories: Category[];
  loading: boolean;
  /** Failure loading the list itself, distinct from a field validation error. */
  loadError: string | null;
  value: string;
  /** Field-level validation message (e.g. a backend 400 on `categoryId`). */
  error?: string | null;
  onChange: (categoryId: string) => void;
}) {
  if (loadError) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <p role="alert" className="text-sm text-coral-ink">
          {loadError}
        </p>
      </div>
    );
  }

  return (
    <Field id={id} label={label} error={error}>
      {(props) => (
        <Select
          {...props}
          value={value}
          disabled={loading}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{loading ? "Loading…" : "Select a category"}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}
