"use client";

// The profile half of the dashboard (SLAI-27): the AI-maintained narrative plus
// the structured habits / trends / notable-changes summary, and the button that
// asks the backend to regenerate it. Presented as the "money story" card.
//
// Two paths the checklist calls out specifically:
//   - GET /profile 404s (NOT_FOUND) when the profile has never been refreshed.
//     That is an empty state with a call to action, not an error banner.
//   - POST /profile/refresh is LLM-backed and shares a per-user rate budget, so a
//     429 must surface `Retry-After` as a real wait. The client already builds
//     that string onto `ApiError.userMessage`; we render it rather than a
//     generic failure.

import { useCallback, useEffect, useState } from "react";
import type { ProfileSummary } from "../api/contract";
import { api } from "../api/client";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";

type ProfileState =
  | { status: "loading" }
  // NOT_FOUND — never refreshed. Distinct from an error: the fix is the refresh
  // button, not "try again".
  | { status: "empty" }
  // AI_DISABLED — the server has no model key (or it was turned off). Not an
  // error: nothing to retry or refresh, so it degrades to a plain note. Normally
  // the dashboard doesn't even mount this section with AI off; this is the guard
  // for a mid-session flip.
  | { status: "disabled" }
  | { status: "error"; message: string }
  | { status: "ready"; profile: ProfileSummary };

// Trust only the client's typed `userMessage` (every failure becomes an
// `ApiError` that carries one); log an unexpected untyped cause and show the
// written fallback rather than leaking a raw `Error.message` into the banner.
function userMessageOf(cause: unknown, fallback: string): string {
  if (typeof (cause as { userMessage?: unknown })?.userMessage === "string") {
    return (cause as { userMessage: string }).userMessage;
  }
  console.error(cause);
  return fallback;
}

/** A missing profile — 404 by code or status — is an empty state, not a failure. */
function isNotFound(cause: unknown): boolean {
  const c = cause as { code?: unknown; status?: unknown } | null;
  return c?.code === "NOT_FOUND" || c?.status === 404;
}

/** AI turned off server-side — a capability state, not a failure. */
function isAiDisabled(cause: unknown): boolean {
  const c = cause as { code?: unknown; status?: unknown } | null;
  return c?.code === "AI_DISABLED" || c?.status === 503;
}

export function ProfileSection() {
  const [state, setState] = useState<ProfileState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // The initial GET, extracted so the error state can offer a retry. A transient
  // failure (network blip, 500, timeout) is not a 404, so it must not be a dead
  // end — the effect runs once, and "Try again" re-invokes the same loader.
  const load = useCallback((signal?: AbortSignal) => {
    return api
      .getProfile(signal)
      .then((res) => setState({ status: "ready", profile: res.profile }))
      .catch((cause: unknown) => {
        if (signal?.aborted) return;
        if (isNotFound(cause)) {
          setState({ status: "empty" });
          return;
        }
        if (isAiDisabled(cause)) {
          setState({ status: "disabled" });
          return;
        }
        setState({
          status: "error",
          message: userMessageOf(cause, "Could not load your profile."),
        });
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function handleRetry() {
    setState({ status: "loading" });
    load();
  }

  async function handleRefresh() {
    setRefreshError(null);
    setRefreshing(true);
    try {
      const { profile } = await api.refreshProfile();
      setState({ status: "ready", profile });
    } catch (cause) {
      // For a 429 this is the "you have used up your refresh budget, try again
      // in N minutes" message the client already assembled from Retry-After.
      setRefreshError(userMessageOf(cause, "Could not refresh your profile."));
    } finally {
      setRefreshing(false);
    }
  }

  const canRefresh =
    state.status !== "loading" && state.status !== "error" && state.status !== "disabled";

  return (
    <section aria-labelledby="profile-heading">
      <Card>
        <CardHeader>
          <CardTitle id="profile-heading">Your money story</CardTitle>
          <span className="rounded-full bg-teal-tint px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-teal-ink">
            AI
          </span>
          {canRefresh ? (
            <Button
              className="ml-auto"
              variant="subtle"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh profile"}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {state.status === "loading" ? (
            <p aria-live="polite" className="text-sm text-muted">
              Loading your profile…
            </p>
          ) : null}

          {state.status === "error" ? (
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="text-sm text-coral-ink">
                {state.message}
              </p>
              {/* A transient load failure needs a way back that is not a page
                  reload. This re-runs the GET; it does not spend the refresh budget. */}
              <Button variant="ghost" size="sm" onClick={handleRetry}>
                Try again
              </Button>
            </div>
          ) : null}

          {state.status === "empty" ? (
            <p data-testid="profile-empty" className="text-sm text-muted">
              No profile yet — refresh to generate your first summary from what you have logged.
            </p>
          ) : null}

          {state.status === "disabled" ? (
            <p data-testid="profile-disabled" className="text-sm text-muted">
              AI mode is off — turn it on to see your profile.
            </p>
          ) : null}

          {state.status === "ready" ? <ProfileBody profile={state.profile} /> : null}

          {refreshError ? (
            <p role="alert" className="mt-3 text-sm text-coral-ink">
              {refreshError}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}

function ProfileBody({ profile }: { profile: ProfileSummary }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[1.02rem] leading-relaxed text-ink">{profile.narrative}</p>

      <SummaryList heading="Habits" items={profile.summary.habits} />
      <SummaryList heading="Trends" items={profile.summary.trends} />
      <SummaryList heading="Notable changes" items={profile.summary.notableChanges} />

      <p className="text-xs text-muted">
        As of <time dateTime={profile.asOfDate}>{profile.asOfDate}</time> · generated by{" "}
        {profile.model}
      </p>
    </div>
  );
}

function SummaryList({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{heading}</h3>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          // The list is the API's own ordering of free-text lines with no id;
          // index is the only stable key available and the list is replaced
          // wholesale on refresh, never reordered in place.
          <span
            key={index}
            className="rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
