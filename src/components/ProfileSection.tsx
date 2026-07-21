"use client";

// The profile half of the dashboard (SLAI-27): the AI-maintained narrative plus
// the structured habits / trends / notable-changes summary, and the button that
// asks the backend to regenerate it.
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

type ProfileState =
  | { status: "loading" }
  // NOT_FOUND — never refreshed. Distinct from an error: the fix is the refresh
  // button, not "try again".
  | { status: "empty" }
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
        setState({ status: "error", message: userMessageOf(cause, "Could not load your profile.") });
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

  return (
    <section aria-labelledby="profile-heading">
      <div className="section-head">
        <h2 id="profile-heading">Your profile</h2>
        {state.status !== "loading" && state.status !== "error" ? (
          <button type="button" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh profile"}
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? <p aria-live="polite">Loading your profile…</p> : null}
      {state.status === "error" ? (
        <>
          <p role="alert" className="field-error">
            {state.message}
          </p>
          {/* A transient load failure needs a way back that is not a page
              reload. This re-runs the GET; it does not spend the refresh budget. */}
          <button type="button" onClick={handleRetry}>
            Try again
          </button>
        </>
      ) : null}

      {state.status === "empty" ? (
        <p data-testid="profile-empty">
          No profile yet — refresh to generate your first summary from what you have logged.
        </p>
      ) : null}

      {state.status === "ready" ? <ProfileBody profile={state.profile} /> : null}

      {refreshError ? (
        <p role="alert" className="field-error">
          {refreshError}
        </p>
      ) : null}
    </section>
  );
}

function ProfileBody({ profile }: { profile: ProfileSummary }) {
  return (
    <div className="profile">
      <p className="profile-narrative">{profile.narrative}</p>

      <SummaryList heading="Habits" items={profile.summary.habits} />
      <SummaryList heading="Trends" items={profile.summary.trends} />
      <SummaryList heading="Notable changes" items={profile.summary.notableChanges} />

      <p className="profile-meta">
        As of <time dateTime={profile.asOfDate}>{profile.asOfDate}</time> · generated by{" "}
        {profile.model}
      </p>
    </div>
  );
}

function SummaryList({ heading, items }: { heading: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="profile-list">
      <h3>{heading}</h3>
      <ul>
        {items.map((item, index) => (
          // The list is the API's own ordering of free-text lines with no id;
          // index is the only stable key available and the list is replaced
          // wholesale on refresh, never reordered in place.
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
