"use client";

// Loads the category list once for the selects that both forms need. Goes
// through `api` (invariant 3) rather than fetching in the component, so the
// token is attached and the error envelope is parsed.

import { useCallback, useEffect, useState } from "react";
import type { Category } from "../api/contract";
import { api } from "../api/client";

interface FetchState {
  categories: Category[];
  loading: boolean;
  /** User-facing message; null while loading or on success. */
  error: string | null;
}

export interface CategoriesState extends FetchState {
  /** Re-run the fetch — for a caller offering a retry after a transient failure. */
  reload: () => void;
}

/**
 * Fetch `GET /categories` on mount. Aborts on unmount so a resolved fetch never
 * calls `setState` on a gone component; a caller-initiated abort is swallowed
 * (it is not a failure the user should see). `reload` re-runs it, so a transient
 * failure is recoverable without a page reload.
 */
export function useCategories(): CategoriesState {
  const [state, setState] = useState<FetchState>({
    categories: [],
    loading: true,
    error: null,
  });
  // Bumping this re-fires the effect below — the retry mechanism.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // `attempt` starts at 0 with the state already `loading`, and `reload` puts
    // it back to `loading` before bumping `attempt` — so the effect never has to
    // reset state synchronously on entry (which would be a set-state-in-effect).
    const controller = new AbortController();

    api
      .getCategories(controller.signal)
      .then((res) => {
        setState({ categories: res.categories, loading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          cause instanceof Error ? cause.message : "Could not load categories.";
        // The client already turns an ApiError into a user-facing string on
        // `userMessage`; prefer that when we have it.
        const userMessage =
          typeof (cause as { userMessage?: unknown })?.userMessage === "string"
            ? (cause as { userMessage: string }).userMessage
            : message;
        setState({ categories: [], loading: false, error: userMessage });
      });

    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => {
    // Back to loading (clearing any prior error) in the event handler, then
    // re-fire the effect — the caller sees the spinner again, not the stale error.
    setState((prev) => ({ ...prev, loading: true, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}
