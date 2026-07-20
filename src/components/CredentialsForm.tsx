"use client";

// The email + password form behind both /login and /signup. The two screens
// differ only in their labels and in what they do on success, so the state
// machine — submitting, failed, succeeded — lives here once.

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

export function CredentialsForm({
  heading,
  submitLabel,
  onSubmit,
  footer,
}: {
  heading: string;
  submitLabel: string;
  /** Rejects with an `Error` whose message is shown to the user. */
  onSubmit: (email: string, password: string) => Promise<void>;
  footer: ReactNode;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>{heading}</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          autoComplete="email"
          required
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          autoComplete="current-password"
          required
          onChange={(event) => setPassword(event.target.value)}
        />

        {error ? (
          <p role="alert" data-testid="form-error">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={submitting}>
          {submitting ? "Working…" : submitLabel}
        </button>
      </form>
      <p>{footer}</p>
    </main>
  );
}
