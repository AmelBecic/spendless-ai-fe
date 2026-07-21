"use client";

// The suggestions feed (SLAI-28): the differentiating screen, behind the same
// auth guard as the rest of the app. The section owns its own data — the feed
// plus the categories and fixed expenses its citations resolve against — so this
// page stays thin.

import Link from "next/link";
import { RequireAuth } from "../../auth/RequireAuth";
import { SuggestionsSection } from "../../components/SuggestionsSection";

function SuggestionsScreen() {
  return (
    <main>
      <h1>Suggestions</h1>
      <p>
        <Link href="/">Back to overview</Link>
      </p>
      <SuggestionsSection />
    </main>
  );
}

export default function SuggestionsPage() {
  return (
    <RequireAuth>
      <SuggestionsScreen />
    </RequireAuth>
  );
}
