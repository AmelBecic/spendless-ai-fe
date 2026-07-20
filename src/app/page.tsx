"use client";

// The first protected screen. It stays deliberately thin — the log-spend forms
// (SLAI-26), the dashboard (SLAI-27) and the suggestions feed (SLAI-28) land
// behind this same guard.

import Link from "next/link";
import { useState } from "react";
import { RequireAuth } from "../auth/RequireAuth";
import { useAuth } from "../auth/AuthProvider";

function Dashboard() {
  const { user, signOut } = useAuth();
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
        <Link href="/log">Log your spending</Link>
      </p>
      <p>The dashboard and suggestions feed land over the rest of Sprint 3.</p>
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
