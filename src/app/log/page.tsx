"use client";

// The log screen (SLAI-26): daily spend and fixed expenses, both behind the
// same auth guard as the rest of the app. The dashboard (SLAI-27) and the
// suggestions feed (SLAI-28) land alongside it.

import Link from "next/link";
import { RequireAuth } from "../../auth/RequireAuth";
import { TransactionsSection } from "../../components/TransactionsSection";
import { FixedExpensesSection } from "../../components/FixedExpensesSection";

function LogScreen() {
  return (
    <main>
      <h1>Log your spending</h1>
      <p>
        <Link href="/">Back to overview</Link>
      </p>
      <TransactionsSection />
      <FixedExpensesSection />
    </main>
  );
}

export default function LogPage() {
  return (
    <RequireAuth>
      <LogScreen />
    </RequireAuth>
  );
}
