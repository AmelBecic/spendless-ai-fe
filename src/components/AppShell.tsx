"use client";

// The app shell for authenticated screens: a sticky header (brand, AI-mode
// switch, sign-out) over a centered content column. Screens render their body as
// children; the width and rhythm live here so every screen shares one frame.

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { AiModeToggle } from "./AiModeToggle";
import { Button } from "./ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // `signOut` rejects on a transport failure; floating it would leave the user
  // signed in with only a console rejection to show for the click.
  function handleSignOut() {
    setSignOutError(null);
    signOut().catch((cause: unknown) => {
      setSignOutError(cause instanceof Error ? cause.message : "Could not sign out.");
    });
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-display text-[1.05rem] font-semibold text-ink"
          >
            <span
              className="h-7 w-7 rounded-[9px] bg-gradient-to-br from-teal to-coral"
              aria-hidden="true"
            />
            SpendLess
          </Link>
          <div className="flex-1" />
          <AiModeToggle />
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        {signOutError ? (
          <p role="alert" className="mb-4 text-sm text-coral-ink">
            {signOutError}
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
