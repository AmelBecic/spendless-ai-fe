"use client";

// The first protected screen. It stays deliberately thin — the log-spend forms
// (SLAI-26), the dashboard (SLAI-27) and the suggestions feed (SLAI-28) land
// behind this same guard.

import { RequireAuth } from "../auth/RequireAuth";
import { useAuth } from "../auth/AuthProvider";

function Dashboard() {
  const { user, signOut } = useAuth();

  return (
    <main>
      <h1>SpendLess AI</h1>
      <p>
        Signed in as <strong>{user?.email}</strong>.
      </p>
      <p>
        Auth and the API client are in place; the screens land over the rest of Sprint 3.
      </p>
      <button type="button" onClick={() => void signOut()}>
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
