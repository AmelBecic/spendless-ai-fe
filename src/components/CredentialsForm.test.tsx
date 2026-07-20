import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CredentialsForm } from "./CredentialsForm";

function renderForm(onSubmit: (email: string, password: string) => Promise<void>) {
  return render(
    <CredentialsForm
      heading="Sign in"
      submitLabel="Sign in"
      onSubmit={onSubmit}
      footer={<span>footer</span>}
    />,
  );
}

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "someone@example.com");
  await user.type(screen.getByLabelText("Password"), "hunter2hunter2");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("CredentialsForm", () => {
  it("passes what was typed to onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit);

    await fillAndSubmit();

    expect(onSubmit).toHaveBeenCalledWith("someone@example.com", "hunter2hunter2");
  });

  it("renders a rejection into the alert region", async () => {
    renderForm(() => Promise.reject(new Error("Invalid login credentials")));

    await fillAndSubmit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid login credentials");
  });

  // A form stuck on "Working…" after a failed attempt cannot be retried, which
  // turns one bad password into a dead screen.
  it("re-enables the button after a failure so the user can retry", async () => {
    renderForm(() => Promise.reject(new Error("Invalid login credentials")));

    await fillAndSubmit();

    await waitFor(() => {
      const button = screen.getByRole("button", { name: "Sign in" });
      expect(button).not.toBeDisabled();
    });
  });

  it("clears a previous error when the form is resubmitted", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error("Invalid login credentials"))
      .mockResolvedValueOnce(undefined);
    renderForm(onSubmit);

    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("falls back to a generic message when the rejection is not an Error", async () => {
    renderForm(() => Promise.reject("kaboom"));

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });
});
