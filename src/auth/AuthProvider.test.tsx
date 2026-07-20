// The session provider, over a stubbed Supabase client. `getSupabase` is
// mocked, so nothing here constructs a real client or makes an auth call.

import type { Session } from "@supabase/supabase-js";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";
import { getSupabase } from "./supabase";

vi.mock("./supabase", () => ({ getSupabase: vi.fn() }));

const sessionFor = (email: string) =>
  ({ access_token: "token", user: { id: "user-1", email } }) as unknown as Session;

const unsubscribe = vi.fn();
/** Set by the stub so a test can push an auth event the way Supabase would. */
let emitAuthEvent: (session: Session | null) => void;

function stubSupabase(getSessionResult: Promise<{ data: { session: Session | null } }>) {
  vi.mocked(getSupabase).mockReturnValue({
    auth: {
      getSession: () => getSessionResult,
      onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
        emitAuthEvent = (session) => callback("SIGNED_IN", session);
        return { data: { subscription: { unsubscribe } } };
      },
    },
  } as unknown as ReturnType<typeof getSupabase>);
}

function Probe() {
  const { user, loading } = useAuth();
  return <p>{loading ? "loading" : (user?.email ?? "signed out")}</p>;
}

const renderProvider = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

beforeEach(() => {
  unsubscribe.mockClear();
});

describe("AuthProvider", () => {
  it("exposes the persisted session once it has been read", async () => {
    stubSupabase(Promise.resolve({ data: { session: sessionFor("restored@example.com") } }));

    renderProvider();

    expect(await screen.findByText("restored@example.com")).toBeInTheDocument();
  });

  it("reports signed out when there is no persisted session", async () => {
    stubSupabase(Promise.resolve({ data: { session: null } }));

    renderProvider();

    expect(await screen.findByText("signed out")).toBeInTheDocument();
  });

  it("mirrors a later auth event into state", async () => {
    stubSupabase(Promise.resolve({ data: { session: null } }));
    renderProvider();
    await screen.findByText("signed out");

    emitAuthEvent(sessionFor("new@example.com"));

    expect(await screen.findByText("new@example.com")).toBeInTheDocument();
  });

  // The initial read and the subscription both write to the same state. If a
  // slow `getSession()` lands after a sign-in, letting it win would clobber a
  // live session with a stale null and bounce the user to /login.
  it("does not let a slow initial read clobber a newer auth event", async () => {
    let resolveInitial: (value: { data: { session: Session | null } }) => void = () => {};
    stubSupabase(new Promise((resolve) => (resolveInitial = resolve)));

    renderProvider();
    emitAuthEvent(sessionFor("fresh@example.com"));
    await screen.findByText("fresh@example.com");

    // The stale read finally arrives, reporting no session. Flush it fully —
    // asserting before React has processed the resulting state update would
    // pass whether or not the clobber is guarded against.
    await act(async () => {
      resolveInitial({ data: { session: null } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText("signed out")).not.toBeInTheDocument();
    expect(screen.getByText("fresh@example.com")).toBeInTheDocument();
  });

  it("unsubscribes on unmount", async () => {
    stubSupabase(Promise.resolve({ data: { session: null } }));
    const { unmount } = renderProvider();
    await screen.findByText("signed out");

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
