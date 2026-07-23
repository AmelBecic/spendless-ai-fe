"use client";

// AI mode for the whole app — two independent gates, one derived answer.
//
//   serverAiAvailable — did the backend start with a model key? (GET /capabilities)
//   userEnabled       — has the user switched AI mode on? (a client preference)
//   aiActive          — both of the above. Nothing AI-backed renders unless it is.
//
// Server capability wins over user preference: a server with no key can't be
// overridden by flipping the toggle, so the toggle hides itself when the server
// reports `ai: false`. The preference is client-only for now (localStorage) — a
// per-user persisted setting is a later upgrade, not needed to unblock no-AI mode.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";

const STORAGE_KEY = "spendless.aiMode";

// The user preference lives in localStorage and is read through
// useSyncExternalStore: the server snapshot is always `false` (no window), and
// React reconciles to the stored value after hydration without a mismatch and
// without a setState-in-effect. A module-level listener set lets a write in this
// tab notify subscribers (the native `storage` event only fires for other tabs).
const prefListeners = new Set<() => void>();

function subscribePreference(onChange: () => void): () => void {
  prefListeners.add(onChange);
  if (typeof window !== "undefined") window.addEventListener("storage", onChange);
  return () => {
    prefListeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onChange);
  };
}

function preferenceSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    // A blocked localStorage (private mode, hardened settings) just means the
    // preference does not persist — not a failure worth surfacing.
    return false;
  }
}

function serverPreferenceSnapshot(): boolean {
  return false;
}

function writePreference(next: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
  } catch {
    // See preferenceSnapshot — persistence is best-effort.
  }
  prefListeners.forEach((notify) => notify());
}

interface AiModeContextValue {
  /** null until GET /capabilities resolves; then the server's answer. */
  serverAiAvailable: boolean | null;
  /** The user's stored preference. Meaningless unless `serverAiAvailable`. */
  userEnabled: boolean;
  /** `serverAiAvailable === true && userEnabled` — the only flag UI should gate on. */
  aiActive: boolean;
  /** True until the capability probe has answered. */
  loading: boolean;
  setUserEnabled: (next: boolean) => void;
}

const AiModeContext = createContext<AiModeContextValue | null>(null);

export function AiModeProvider({ children }: { children: ReactNode }) {
  const [serverAiAvailable, setServerAiAvailable] = useState<boolean | null>(null);
  const userEnabled = useSyncExternalStore(
    subscribePreference,
    preferenceSnapshot,
    serverPreferenceSnapshot,
  );

  useEffect(() => {
    const controller = new AbortController();
    api
      .getCapabilities(controller.signal)
      .then((caps) => setServerAiAvailable(caps.ai))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        // Treat an unreachable/failed probe as "AI unavailable" rather than
        // blocking the app: the money features do not depend on the answer.
        console.error("Could not read server capabilities", cause);
        setServerAiAvailable(false);
      });
    return () => controller.abort();
  }, []);

  const value = useMemo<AiModeContextValue>(
    () => ({
      serverAiAvailable,
      userEnabled,
      aiActive: serverAiAvailable === true && userEnabled,
      loading: serverAiAvailable === null,
      setUserEnabled: writePreference,
    }),
    [serverAiAvailable, userEnabled],
  );

  return <AiModeContext.Provider value={value}>{children}</AiModeContext.Provider>;
}

export function useAiMode(): AiModeContextValue {
  const value = useContext(AiModeContext);
  if (!value) throw new Error("useAiMode must be used within an AiModeProvider");
  return value;
}
