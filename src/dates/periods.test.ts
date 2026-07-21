import { describe, expect, it } from "vitest";
import { buildPeriods, toISODate } from "./periods";

describe("toISODate", () => {
  it("formats a date as a bare UTC YYYY-MM-DD", () => {
    expect(toISODate(new Date("2026-07-21T00:00:00.000Z"))).toBe("2026-07-21");
  });

  it("uses the UTC calendar day, not the host's local one", () => {
    // 23:30 UTC on the 21st is already the 22nd in a positive-offset zone. The
    // boundary the backend interprets is UTC, so it must read as the 21st
    // regardless of where the test runs.
    expect(toISODate(new Date("2026-07-21T23:30:00.000Z"))).toBe("2026-07-21");
  });

  it("zero-pads month and day", () => {
    expect(toISODate(new Date("2026-03-09T12:00:00.000Z"))).toBe("2026-03-09");
  });
});

describe("buildPeriods", () => {
  const now = new Date("2026-07-21T12:00:00.000Z");

  it("shares one inclusive `to` — today, in UTC — across every window", () => {
    for (const period of buildPeriods(now)) {
      expect(period.to).toBe("2026-07-21");
    }
  });

  it("starts 'This month' on the first of the current UTC month", () => {
    const thisMonth = buildPeriods(now).find((p) => p.id === "this-month");
    expect(thisMonth?.from).toBe("2026-07-01");
  });

  it("counts 'Last 7 days' inclusively — today plus the six before it", () => {
    const last7 = buildPeriods(now).find((p) => p.id === "last-7");
    expect(last7?.from).toBe("2026-07-15");
  });

  it("rolls a last-N window back across a month boundary", () => {
    // 30 days back from 3 July lands in June; Date.UTC normalises the underflow.
    const early = new Date("2026-07-03T12:00:00.000Z");
    const last30 = buildPeriods(early).find((p) => p.id === "last-30");
    expect(last30?.from).toBe("2026-06-04");
  });

  it("emits only bare YYYY-MM-DD boundaries, no timestamps", () => {
    for (const period of buildPeriods(now)) {
      expect(period.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(period.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
