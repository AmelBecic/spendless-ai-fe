"use client";

// Wraps anything that must not render without a session.
//
// `loading` and "signed out" are separate states on purpose: treating a session
// that has not been read yet as absent would bounce every returning user to
// /login for a frame before their persisted session resolved.

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { LOGIN_PATH } from "../api/client";
import { useAuth } from "./AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace(LOGIN_PATH);
  }, [loading, session, router]);

  if (loading) return <p aria-live="polite">Loading…</p>;
  // The redirect above is in flight; rendering the children for that frame would
  // fire their authenticated requests with no token.
  if (!session) return null;

  return <>{children}</>;
}
