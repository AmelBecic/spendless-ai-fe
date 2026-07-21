"use client";

// The dashboard (SLAI-27): the stats grid and the profile narrative behind the
// same auth guard as the rest of the app. The period selector lives here so its
// choice drives the `from`/`to` on the stats request one level down.

import Link from "next/link";
import { useMemo, useState } from "react";
import { RequireAuth } from "../../auth/RequireAuth";
import { useCategories } from "../../hooks/useCategories";
import { buildPeriods } from "../../dates/periods";
import { PeriodSelector } from "../../components/PeriodSelector";
import { StatsSection } from "../../components/StatsSection";
import { ProfileSection } from "../../components/ProfileSection";

function DashboardScreen() {
  // Anchored once on mount so every window shares one `now`; re-deriving on each
  // render would let the periods drift across a UTC midnight mid-session.
  const periods = useMemo(() => buildPeriods(), []);
  const [periodId, setPeriodId] = useState(periods[0].id);
  const period = periods.find((p) => p.id === periodId) ?? periods[0];

  // Same as the log screen: the category list is fetched once and shared, here
  // to label the per-category stat rows. Its loading/error state is passed down
  // so the rows can wait for labels rather than flash raw ids.
  const { categories, loading, error } = useCategories();

  return (
    <main>
      <h1>Overview</h1>
      <p>
        <Link href="/log">Log your spending</Link>
      </p>

      <PeriodSelector periods={periods} value={periodId} onChange={setPeriodId} />
      {/* Keyed on the period so a change remounts the section into a fresh
          loading state rather than briefly showing the previous window's grid. */}
      <StatsSection
        key={period.id}
        period={period}
        categories={categories}
        categoriesLoading={loading}
        categoriesError={error}
      />
      <ProfileSection />
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardScreen />
    </RequireAuth>
  );
}
