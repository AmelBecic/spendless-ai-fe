// The browser-side Supabase client — one instance for the whole app.
//
// Only the URL and the anon key reach here, and both are `NEXT_PUBLIC_*` by
// design: the anon key is safe in the bundle because every table has RLS. The
// service-role key must never appear in this repo (see `.env.example`).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Read as static property accesses so Next can inline them at build time — a
// computed lookup like `process.env[name]` is not substituted and arrives
// undefined in the browser.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cached: SupabaseClient | null = null;

/**
 * The shared Supabase client, created on first use.
 *
 * Lazy rather than created at module scope so that importing anything from this
 * module — a type, a helper, a test double — does not blow up when the env is
 * unset. The suite never reaches this function: it injects its own token
 * provider into the API client instead.
 */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  cached = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // Session survives a reload (localStorage), and the library refreshes the
      // access token in the background. Both are what let `getAccessToken` in
      // src/api/client.ts stay a single read rather than a per-call refresh
      // dance at every call site.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return cached;
}
