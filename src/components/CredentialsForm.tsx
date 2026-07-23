"use client";

// The email + password form behind both /login and /signup. The two screens
// differ only in their labels and in what they do on success, so the state
// machine — submitting, failed, succeeded — lives here once. Redesigned on the
// design system (SLAI-39): a centered auth card under the brand mark.

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { AuthLayout } from "./AuthLayout";

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
    <AuthLayout footer={footer}>
      <Card>
        <CardHeader>
          <CardTitle>{heading}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                autoComplete="email"
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                autoComplete="current-password"
                required
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {error ? (
              <p role="alert" data-testid="form-error" className="text-sm text-coral-ink">
                {error}
              </p>
            ) : null}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Working…" : submitLabel}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
