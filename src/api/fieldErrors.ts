// Turn a failed request into per-field messages plus a single form-level
// fallback, so a 400 renders against the input that caused it.
//
// The backend sends `details: [{ path, message }]` on VALIDATION_FAILED
// precisely so the form can point at the offending field (checklist: "Field-
// level 400s render against the offending field"). Collapsing them into one
// banner throws that away — the user is told "something is wrong" without being
// told which box to fix.

import { ApiError } from "./client";

export interface FormErrors {
  /** Keyed by field path (`"amountCents"`, `"money.currency"`, `"label"`). */
  fields: Record<string, string>;
  /**
   * A message for the form as a whole: a non-validation failure, a rate limit,
   * or a validation entry with an empty `path` (a whole-object rule that belongs
   * to no single field). `null` when every error found a field to land on.
   */
  form: string | null;
}

const EMPTY: FormErrors = { fields: {}, form: null };

/**
 * Classify an unknown thrown value into field-level and form-level messages.
 *
 * A non-`ApiError` (or an `ApiError` with no usable detail) becomes a single
 * form-level message — the same `userMessage` the client already wrote for
 * humans, never a raw envelope string or a library internal.
 */
export function toFormErrors(error: unknown): FormErrors {
  if (!(error instanceof ApiError)) {
    return {
      fields: {},
      form: error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.",
    };
  }

  const details = error.details ?? [];
  if (details.length === 0) {
    // No field breakdown (a 429, a 500, a 404): show the client's user-facing
    // message at form level rather than pretending it belongs to a field.
    return { fields: {}, form: error.userMessage };
  }

  const fields: Record<string, string> = {};
  let form: string | null = null;
  for (const { path, message } of details) {
    if (path) {
      // First message wins per field — the backend orders them, and stacking
      // several under one input reads worse than showing the first.
      if (!(path in fields)) fields[path] = message;
    } else {
      // An empty path is a whole-object rule (e.g. "at least one field
      // required"): it has no input to sit under, so it goes to the form.
      form ??= message;
    }
  }

  return { fields, form };
}

export { EMPTY as NO_FORM_ERRORS };
