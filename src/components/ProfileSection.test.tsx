import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileSummary } from "../api/contract";

vi.mock("../api/client", () => ({
  api: { getProfile: vi.fn(), refreshProfile: vi.fn() },
}));

import { api } from "../api/client";
import { ProfileSection } from "./ProfileSection";

const mockApi = vi.mocked(api);

function profile(overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return {
    id: "prof-1",
    userId: "user-1",
    asOfDate: "2026-07-20",
    summary: {
      habits: ["Eats out on weekends"],
      trends: ["Groceries trending up"],
      notableChanges: ["New gym membership"],
    },
    narrative: "You spend steadily, with a weekend dining habit.",
    model: "claude-opus-4-8",
    createdAt: "2026-07-20T09:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfileSection", () => {
  it("renders the narrative and the structured summary", async () => {
    mockApi.getProfile.mockResolvedValue({ profile: profile() });

    render(<ProfileSection />);

    expect(await screen.findByText("You spend steadily, with a weekend dining habit.")).toBeInTheDocument();
    expect(screen.getByText("Eats out on weekends")).toBeInTheDocument();
    expect(screen.getByText("Groceries trending up")).toBeInTheDocument();
    expect(screen.getByText("New gym membership")).toBeInTheDocument();
  });

  it("treats a 404 as an empty state with a refresh call to action, not an error", async () => {
    mockApi.getProfile.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "NOT_FOUND", status: 404 }),
    );

    render(<ProfileSection />);

    expect(await screen.findByTestId("profile-empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh profile" })).toBeInTheDocument();
    // Not an error banner.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refreshes the profile from the empty state", async () => {
    mockApi.getProfile.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "NOT_FOUND", status: 404 }),
    );
    mockApi.refreshProfile.mockResolvedValue({ profile: profile({ narrative: "Freshly generated summary." }) });

    render(<ProfileSection />);
    await screen.findByTestId("profile-empty");

    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh profile" }));

    expect(await screen.findByText("Freshly generated summary.")).toBeInTheDocument();
  });

  it("offers a retry after a non-404 load failure and recovers on success", async () => {
    mockApi.getProfile
      .mockRejectedValueOnce(
        Object.assign(new Error("boom"), { status: 500, userMessage: "Could not load your profile." }),
      )
      .mockResolvedValueOnce({ profile: profile() });

    render(<ProfileSection />);
    expect(await screen.findByText("Could not load your profile.")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("You spend steadily, with a weekend dining habit.")).toBeInTheDocument();
  });

  it("surfaces the 429 budget message from the typed error on refresh", async () => {
    mockApi.getProfile.mockResolvedValue({ profile: profile() });
    mockApi.refreshProfile.mockRejectedValue(
      Object.assign(new Error("rate limited"), {
        code: "RATE_LIMITED",
        status: 429,
        userMessage: "You have used up your refresh budget. Try again in 2 minutes.",
      }),
    );

    render(<ProfileSection />);
    await screen.findByText("You spend steadily, with a weekend dining habit.");

    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh profile" }));

    expect(
      await screen.findByText("You have used up your refresh budget. Try again in 2 minutes."),
    ).toBeInTheDocument();
  });
});
