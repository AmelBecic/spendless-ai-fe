"use client";

// The first protected screen. It stays deliberately thin — a hub that links out
// to the dashboard (SLAI-27), the log-spend forms (SLAI-26) and the suggestions
// feed (SLAI-28), all behind this same guard.

import Link from "next/link";
import { useState } from "react";
import { RequireAuth } from "../auth/RequireAuth";
import { useAuth } from "../auth/AuthProvider";
import { useAiMode } from "../ai/AiModeProvider";
import { AiModeToggle } from "../components/AiModeToggle";

function Dashboard() {
  const { user, signOut } = useAuth();
  const { aiActive } = useAiMode();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  // `signOut` rejects on a transport failure. Floating the promise would leave
  // the user still signed in, nothing on screen, and only a console rejection
  // to show for the click.
  function handleSignOut() {
    setSignOutError(null);
    signOut().catch((cause: unknown) => {
      setSignOutError(cause instanceof Error ? cause.message : "Could not sign out.");
    });
  }

  return (
    <main>
      <h1>SpendLess AI</h1>
      <p>
        Signed in as <strong>{user?.email}</strong>.
      </p>
      <p>
        <Link href="/dashboard">View your dashboard</Link>
      </p>
      <p>
        <Link href="/log">Log your spending</Link>
      </p>
      {/* The suggestions feed is AI-backed — only offered when AI mode is active. */}
      {aiActive ? (
        <p>
          <Link href="/suggestions">See your savings suggestions</Link>
        </p>
      ) : null}
      <AiModeToggle />
      {signOutError ? <p role="alert">{signOutError}</p> : null}
      <button type="button" onClick={handleSignOut}>
        Sign out
      </button>
    </main>
  );
}

export default function Home() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
