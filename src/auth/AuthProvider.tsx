"use client";

// Session state for the whole app.
//
// The Supabase client persists the session to localStorage and refreshes the
// access token in the background; this provider mirrors that into React state
// so components can render against it. It deliberately holds no token of its
// own — `src/api/client.ts` reads the live one per request, so there is one
// answer to "am I signed in", not two that can disagree.

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toUserFacingAuthError } from "./authErrors";
import { getSupabase } from "./supabase";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been read — not the same as signed out. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;
    // Two writers race into `setSession`. If the subscription has already
    // delivered an event — a fast sign-in, or the SIGNED_IN from a
    // `detectSessionInUrl` hash exchange — then the initial read is the older
    // answer, and letting it land would clobber a live session with a stale
    // (possibly null) one and bounce the user to /login.
    let sawAuthEvent = false;

    // Read the persisted session once on mount, then let the subscription below
    // carry every later change (sign-in, sign-out, background token refresh,
    // and the sign-out the API client triggers on a 401).
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active || sawAuthEvent) return;
        setSession(data.session);
      })
      .catch((cause) => {
        console.error("Could not restore the Supabase session", cause);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      sawAuthEvent = true;
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw toUserFacingAuthError(error);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await getSupabase().auth.signUp({ email, password });
    if (error) throw toUserFacingAuthError(error);
    // With email confirmation on, Supabase returns a user but no session — the
    // caller has to say "check your inbox" rather than route to the dashboard.
    return { needsEmailConfirmation: data.session === null };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw toUserFacingAuthError(error);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, loading, signIn, signUp, signOut }),
    [session, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
