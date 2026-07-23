import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api/client", () => ({ api: { getCapabilities: vi.fn() } }));

import { api } from "../api/client";
import { AiModeProvider, useAiMode } from "./AiModeProvider";

const mockApi = vi.mocked(api);

// Surfaces the three flags plus a button to flip the preference.
function Probe() {
  const { serverAiAvailable, userEnabled, aiActive, setUserEnabled } = useAiMode();
  return (
    <div>
      <span data-testid="server">{String(serverAiAvailable)}</span>
      <span data-testid="user">{String(userEnabled)}</span>
      <span data-testid="active">{String(aiActive)}</span>
      <button onClick={() => setUserEnabled(!userEnabled)}>toggle</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <AiModeProvider>
      <Probe />
    </AiModeProvider>,
  );

describe("AiModeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("reports the server capability and defaults the preference off", async () => {
    mockApi.getCapabilities.mockResolvedValue({ ai: true });
    renderProbe();

    await waitFor(() => expect(screen.getByTestId("server")).toHaveTextContent("true"));
    expect(screen.getByTestId("user")).toHaveTextContent("false");
    // Capable but not enabled → not active.
    expect(screen.getByTestId("active")).toHaveTextContent("false");
  });

  it("activates AI only when capable and enabled, and persists the preference", async () => {
    mockApi.getCapabilities.mockResolvedValue({ ai: true });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("server")).toHaveTextContent("true"));

    await userEvent.click(screen.getByRole("button", { name: "toggle" }));

    expect(screen.getByTestId("active")).toHaveTextContent("true");
    expect(window.localStorage.getItem("spendless.aiMode")).toBe("true");
  });

  it("never activates when the server has no AI, even with the preference on", async () => {
    window.localStorage.setItem("spendless.aiMode", "true");
    mockApi.getCapabilities.mockResolvedValue({ ai: false });
    renderProbe();

    await waitFor(() => expect(screen.getByTestId("server")).toHaveTextContent("false"));
    // Stored preference is read on mount...
    expect(screen.getByTestId("user")).toHaveTextContent("true");
    // ...but server capability wins.
    expect(screen.getByTestId("active")).toHaveTextContent("false");
  });

  it("treats a failed capability probe as AI unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockApi.getCapabilities.mockRejectedValue(new Error("network"));
    renderProbe();

    await waitFor(() => expect(screen.getByTestId("server")).toHaveTextContent("false"));
    expect(screen.getByTestId("active")).toHaveTextContent("false");
  });
});
