import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignupPage from "./page";
import { useAuth } from "../../auth/AuthProvider";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: vi.fn() }));

const signUp = vi.fn();

beforeEach(() => {
  replace.mockClear();
  signUp.mockReset();
  vi.mocked(useAuth).mockReturnValue({ signUp } as unknown as ReturnType<typeof useAuth>);
});

async function submit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.type(screen.getByLabelText("Password"), "hunter2hunter2");
  await user.click(screen.getByRole("button", { name: "Sign up" }));
}

describe("SignupPage", () => {
  // With email confirmation on there is no session yet, so routing to the
  // dashboard would bounce straight back to /login with no explanation.
  it("shows the check-inbox panel when confirmation is required", async () => {
    signUp.mockResolvedValue({ needsEmailConfirmation: true });
    render(<SignupPage />);

    await submit();

    expect(await screen.findByText("Confirm your email")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("routes to the dashboard when a session was issued straight away", async () => {
    signUp.mockResolvedValue({ needsEmailConfirmation: false });
    render(<SignupPage />);

    await submit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("Confirm your email")).not.toBeInTheDocument();
  });

  it("surfaces a failed signup instead of navigating", async () => {
    signUp.mockRejectedValue(new Error("Password is too short"));
    render(<SignupPage />);

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Password is too short");
    expect(replace).not.toHaveBeenCalled();
  });
});
