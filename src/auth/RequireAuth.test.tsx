// The protected-route guard. Supabase is never constructed here — `useAuth` is
// mocked, so the suite makes no live auth call.

import type { Session } from "@supabase/supabase-js";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequireAuth } from "./RequireAuth";
import { useAuth } from "./AuthProvider";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("./AuthProvider", () => ({ useAuth: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);

/** Only the fields the guard reads — it branches on presence, not on contents. */
const A_SESSION = { access_token: "token", user: { id: "user-1" } } as unknown as Session;

function stubAuth(state: { session: Session | null; loading: boolean }) {
  mockedUseAuth.mockReturnValue({
    ...state,
    user: state.session?.user ?? null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);
}

beforeEach(() => {
  replace.mockClear();
});

describe("RequireAuth", () => {
  it("renders the children when there is a session", () => {
    stubAuth({ session: A_SESSION, loading: false });

    render(
      <RequireAuth>
        <p>protected content</p>
      </RequireAuth>,
    );

    expect(screen.getByText("protected content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /login when the session is absent", () => {
    stubAuth({ session: null, loading: false });

    render(
      <RequireAuth>
        <p>protected content</p>
      </RequireAuth>,
    );

    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  // "Not read yet" and "signed out" are different states. Collapsing them would
  // bounce every returning user to /login for a frame before their persisted
  // session resolved.
  it("waits rather than redirecting while the session is still loading", () => {
    stubAuth({ session: null, loading: true });

    render(
      <RequireAuth>
        <p>protected content</p>
      </RequireAuth>,
    );

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });
});
