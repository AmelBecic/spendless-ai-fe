"use client";

// The suggestions feed (SLAI-28): the differentiating screen, behind the same
// auth guard as the rest of the app. The section owns its own data — the feed
// plus the categories and fixed expenses its citations resolve against — so this
// page stays thin. Rebuilt on the app shell in the redesign (SLAI-42).

import { RequireAuth } from "../../auth/RequireAuth";
import { AppShell } from "../../components/AppShell";
import { SuggestionsSection } from "../../components/SuggestionsSection";
import { AiModeToggle } from "../../components/AiModeToggle";
import { useAiMode } from "../../ai/AiModeProvider";

function SuggestionsScreen() {
  const { aiActive, loading } = useAiMode();

  return (
    <AppShell>
      <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-ink">
        Suggestions
      </h1>
      {loading ? null : aiActive ? (
        <SuggestionsSection />
      ) : (
        // Reachable directly by URL even with AI off — degrade to a call to
        // action rather than firing an AI request that would come back AI_DISABLED.
        <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
          <p className="text-ink">Savings suggestions need AI mode, which is currently off.</p>
          <div className="mt-4">
            <AiModeToggle showHint />
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function SuggestionsPage() {
  return (
    <RequireAuth>
      <SuggestionsScreen />
    </RequireAuth>
  );
}
