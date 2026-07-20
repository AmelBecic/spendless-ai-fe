"use client";

// Loads the category list once for the selects that both forms need. Goes
// through `api` (invariant 3) rather than fetching in the component, so the
// token is attached and the error envelope is parsed.

import { useEffect, useState } from "react";
import type { Category } from "../api/contract";
import { api } from "../api/client";

export interface CategoriesState {
  categories: Category[];
  loading: boolean;
  /** User-facing message; null while loading or on success. */
  error: string | null;
}

/**
 * Fetch `GET /categories` on mount. Aborts on unmount so a resolved fetch never
 * calls `setState` on a gone component; a caller-initiated abort is swallowed
 * (it is not a failure the user should see).
 */
export function useCategories(): CategoriesState {
  const [state, setState] = useState<CategoriesState>({
    categories: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Runs once on mount; the initial state is already `loading`, so there is no
    // synchronous reset to do here.
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
  }, []);

  return state;
}
