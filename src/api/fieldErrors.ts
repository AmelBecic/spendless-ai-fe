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
 * Requests send `amountCents` / `currency` flat while responses nest them under
 * `money` (see contract.ts). A validation path like `"money.currency"` therefore
 * names the same flat field the form renders as `currency` — map it back so the
 * message lands on the input rather than under a key nothing reads.
 */
function normalizeFieldPath(path: string): string {
  return path.replace(/^money\./, "");
}

/**
 * Classify an unknown thrown value into field-level and form-level messages.
 *
 * A non-`ApiError` (or an `ApiError` with no usable detail) becomes a single
 * form-level message — the same `userMessage` the client already wrote for
 * humans, never a raw envelope string or a library internal.
 *
 * `knownFields` is the set of field paths the caller actually renders. When
 * given, a detail whose (normalized) path is *not* one of them is routed to the
 * form-level fallback rather than dropped into a `fields` key no input reads —
 * a message that names a field the form does not show must still reach the user,
 * or AC3's "tell them which box to fix" fails silently.
 */
export function toFormErrors(error: unknown, knownFields?: readonly string[]): FormErrors {
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
  const toForm = (message: string) => {
    form ??= message;
  };

  for (const { path, message } of details) {
    if (!path) {
      // An empty path is a whole-object rule (e.g. "at least one field
      // required"): it has no input to sit under, so it goes to the form.
      toForm(message);
      continue;
    }

    const key = normalizeFieldPath(path);
    if (knownFields && !knownFields.includes(key)) {
      // The form does not render this field — surface it at form level rather
      // than letting it vanish into an unread `fields` key.
      toForm(message);
      continue;
    }

    // First message wins per field — the backend orders them, and stacking
    // several under one input reads worse than showing the first.
    if (!(key in fields)) fields[key] = message;
  }

  return { fields, form };
}

export { EMPTY as NO_FORM_ERRORS };
