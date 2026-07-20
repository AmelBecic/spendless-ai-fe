// Turns a Supabase auth failure into something a user can act on.
//
// Supabase reports a transport failure as an `AuthError` whose message is the
// browser's own — "Failed to fetch", "Load failed" depending on the engine.
// Rendering that verbatim tells the user nothing about what to do, which is the
// same failure mode the API client's rate-limit path exists to avoid. Genuine
// auth messages ("Invalid login credentials") are already user-facing and are
// passed through untouched.

import { AuthError } from "@supabase/supabase-js";

const NETWORK_FAILURE = [/failed to fetch/i, /networkerror/i, /load failed/i, /network request failed/i];

const UNREACHABLE =
  "Could not reach the authentication service. Check your connection and try again.";

export function toUserFacingAuthError(cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : "";

  // status 0 is what supabase-js uses when the request never got a response;
  // the message patterns catch the same thing across engines.
  const isTransportFailure =
    (cause instanceof AuthError && cause.status === 0) ||
    NETWORK_FAILURE.some((pattern) => pattern.test(message));

  if (isTransportFailure) return new Error(UNREACHABLE, { cause });
  if (cause instanceof Error) return cause;
  return new Error("Something went wrong. Please try again.", { cause });
}
