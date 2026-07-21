import { describe, expect, it } from "vitest";
import { formatShare } from "./formatShare";

describe("formatShare", () => {
  it("renders a fraction as a percentage without the caller multiplying", () => {
    // The point of the helper: 0.45 in, "45%" out — Intl does the *100, so no
    // percentage is ever computed in component state (invariant 2).
    expect(formatShare(0.45, "en-US")).toBe("45%");
  });

  it("keeps one fractional digit so a small share does not round to 0%", () => {
    expect(formatShare(0.333, "en-US")).toBe("33.3%");
  });

  it("handles the endpoints", () => {
    expect(formatShare(0, "en-US")).toBe("0%");
    expect(formatShare(1, "en-US")).toBe("100%");
  });
});
