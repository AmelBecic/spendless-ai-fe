"use client";

// The first protected screen — a hub that links out to the dashboard (SLAI-27),
// the log-spend forms (SLAI-26) and, when AI mode is active, the suggestions feed
// (SLAI-28). Rebuilt on the app shell in the redesign (SLAI-38).

import Link from "next/link";
import { RequireAuth } from "../auth/RequireAuth";
import { useAuth } from "../auth/AuthProvider";
import { useAiMode } from "../ai/AiModeProvider";
import { AppShell } from "../components/AppShell";

function NavCard({
  href,
  title,
  desc,
  accent = false,
}: {
  href: string;
  title: string;
  desc: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-card border bg-surface p-5 shadow-soft transition-colors hover:border-teal ${
        accent ? "border-teal/40" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <span
          className="text-muted transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          →
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </Link>
  );
}

function Overview() {
  const { user } = useAuth();
  const { aiActive } = useAiMode();

  return (
    <AppShell>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Overview</h1>
      <p className="mt-1 text-sm text-muted">
        Signed in as <span className="font-medium text-ink">{user?.email}</span>
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <NavCard href="/dashboard" title="Dashboard" desc="Your spend and profile, at a glance." />
        <NavCard href="/log" title="Log spending" desc="Add daily spend and fixed expenses." />
        {/* AI-backed — only offered when AI mode is active. */}
        {aiActive ? (
          <NavCard
            href="/suggestions"
            title="Savings suggestions"
            desc="Grounded, cited advice from your profile."
            accent
          />
        ) : null}
      </div>
    </AppShell>
  );
}

export default function Home() {
  return (
    <RequireAuth>
      <Overview />
    </RequireAuth>
  );
}
