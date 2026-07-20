// The cents-parsing edge cases the ticket names explicitly (SLAI-26 AC bullet 4):
// "12.5", "12.345", comma separators, empty input, negative values — plus the
// bounds the checklist calls out. Values are chosen so an expected result never
// coincides with an accidental one (e.g. 1205 vs 1250 catches a dropped zero).

import { describe, expect, it } from "vitest";
import { INT4_MAX } from "../api/contract";
import { centsToAmountInput, parseAmountToCents } from "./parseAmount";

/** A parse that must succeed with exactly `cents`. */
function cents(raw: string): number | undefined {
  const result = parseAmountToCents(raw);
  if (!result.ok) throw new Error(`expected "${raw}" to parse, got: ${result.reason}`);
  return result.cents;
}

/** True when a parse was rejected. */
function rejected(raw: string): boolean {
  return parseAmountToCents(raw).ok === false;
}

describe("parseAmountToCents", () => {
  it("treats empty and whitespace-only input as an absent field, not an error", () => {
    expect(cents("")).toBeUndefined();
    expect(cents("   ")).toBeUndefined();
  });

  it("parses a whole number to full cents", () => {
    expect(cents("12")).toBe(1200);
    expect(cents("7")).toBe(700);
  });

  it('scales a single decimal place — "12.5" is 1250 cents, not 125', () => {
    expect(cents("12.5")).toBe(1250);
  });

  it("keeps two decimal places exactly, including a leading zero in the fraction", () => {
    expect(cents("12.50")).toBe(1250);
    expect(cents("12.05")).toBe(1205);
    expect(cents("0.99")).toBe(99);
    expect(cents("0.09")).toBe(9);
  });

  it('rejects more precision than cents can hold — "12.345" is not rounded to 1234', () => {
    expect(rejected("12.345")).toBe(true);
    expect(rejected("12.999")).toBe(true);
  });

  it("accepts a comma as the decimal separator", () => {
    expect(cents("12,50")).toBe(1250);
    expect(cents("12,5")).toBe(1250);
    expect(cents("1234,05")).toBe(123405);
  });

  it("rejects a value carrying both separators — grouping is ambiguous, not guessed", () => {
    expect(rejected("1,234.50")).toBe(true);
    expect(rejected("1.234,50")).toBe(true);
  });

  it("rejects negative amounts", () => {
    expect(rejected("-5")).toBe(true);
    expect(rejected("-0.01")).toBe(true);
    expect(rejected("-12,50")).toBe(true);
  });

  it("rejects zero — the backend requires a positive amount", () => {
    expect(rejected("0")).toBe(true);
    expect(rejected("0.00")).toBe(true);
    expect(rejected("0,00")).toBe(true);
  });

  it("rejects non-numeric and malformed input", () => {
    expect(rejected("abc")).toBe(true);
    expect(rejected("12.5.6")).toBe(true);
    expect(rejected(".5")).toBe(true);
    expect(rejected("5.")).toBe(true);
    expect(rejected("1 2")).toBe(true);
  });

  it("tolerates a leading currency symbol and the space after it", () => {
    expect(cents("$12.50")).toBe(1250);
    expect(cents("€ 12,50")).toBe(1250);
    expect(cents("£7")).toBe(700);
  });

  it("accepts the backend's largest amount and rejects one cent over it", () => {
    // INT4_MAX cents === 21474836.47 major units, exactly.
    expect(cents("21474836.47")).toBe(INT4_MAX);
    expect(rejected("21474836.48")).toBe(true);
    expect(rejected("21474837")).toBe(true);
  });

  it("rejects a whole part too long to hold precisely, without going through parseFloat", () => {
    expect(rejected("99999999999")).toBe(true);
    expect(rejected("100000000000000000000")).toBe(true);
  });
});

describe("centsToAmountInput", () => {
  it("renders cents as a two-decimal string", () => {
    expect(centsToAmountInput(1899)).toBe("18.99");
    expect(centsToAmountInput(9)).toBe("0.09");
    expect(centsToAmountInput(95000)).toBe("950.00");
  });

  it("round-trips through parseAmountToCents", () => {
    for (const cents of [99, 1250, 1899, 95000, INT4_MAX]) {
      expect(parseAmountToCents(centsToAmountInput(cents))).toEqual({ ok: true, cents });
    }
  });
});
