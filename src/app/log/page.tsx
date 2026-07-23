"use client";

// The log screen (SLAI-26): daily spend and fixed expenses, both behind the
// same auth guard as the rest of the app. Rebuilt on the app shell in the
// redesign (SLAI-40).

import { RequireAuth } from "../../auth/RequireAuth";
import { AppShell } from "../../components/AppShell";
import { useCategories } from "../../hooks/useCategories";
import { TransactionsSection } from "../../components/TransactionsSection";
import { FixedExpensesSection } from "../../components/FixedExpensesSection";

function LogScreen() {
  // Fetched once here and shared: both sections need the same immutable
  // category list, so fetching it per section would double the request.
  const { categories, loading, error } = useCategories();

  return (
    <AppShell>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-ink">
        Log your spending
      </h1>
      <TransactionsSection
        categories={categories}
        categoriesLoading={loading}
        categoriesError={error}
      />
      <FixedExpensesSection
        categories={categories}
        categoriesLoading={loading}
        categoriesError={error}
      />
    </AppShell>
  );
}

export default function LogPage() {
  return (
    <RequireAuth>
      <LogScreen />
    </RequireAuth>
  );
}
