"use client";

// The suggestions feed (SLAI-28): the differentiating screen, behind the same
// auth guard as the rest of the app. The section owns its own data — the feed
// plus the categories and fixed expenses its citations resolve against — so this
// page stays thin.

import Link from "next/link";
import { RequireAuth } from "../../auth/RequireAuth";
import { SuggestionsSection } from "../../components/SuggestionsSection";
import { AiModeToggle } from "../../components/AiModeToggle";
import { useAiMode } from "../../ai/AiModeProvider";

function SuggestionsScreen() {
  const { aiActive, loading } = useAiMode();

  return (
    <main>
      <h1>Suggestions</h1>
      <p>
        <Link href="/">Back to overview</Link>
      </p>
      {loading ? null : aiActive ? (
        <SuggestionsSection />
      ) : (
        // Reachable directly by URL even with AI off — degrade to a call to
        // action rather than firing an AI request that would come back AI_DISABLED.
        <>
          <p>Savings suggestions need AI mode, which is currently off.</p>
          <AiModeToggle />
        </>
      )}
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
