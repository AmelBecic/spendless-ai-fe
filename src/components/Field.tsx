"use client";

// A labelled field with a dedicated error slot, wired for screen readers:
// `aria-invalid` and `aria-describedby` point the input at its own message, so a
// field-level 400 is announced against that field rather than lost in a banner.

import type { ReactNode } from "react";

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  /** Backend or local validation message for this one field; null when valid. */
  error?: string | null;
  /** The input/select, given `id`, `aria-invalid` and `aria-describedby`. */
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? errorId : undefined,
      })}
      {error ? (
        <p id={errorId} role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
