import { describe, expect, it } from "vitest";
import { formatMoney } from "./formatMoney";

describe("formatMoney", () => {
  it("renders integer cents as a decimal amount, dividing only at format time", () => {
    expect(formatMoney({ amountCents: 1250, currency: "EUR" }, "en-US")).toBe("€12.50");
    expect(formatMoney({ amountCents: 1234567, currency: "USD" }, "en-US")).toBe("$12,345.67");
    expect(formatMoney({ amountCents: 9, currency: "USD" }, "en-US")).toBe("$0.09");
  });

  it("takes the currency from the data, not the locale", () => {
    // A EUR amount formatted with a US locale must not print a dollar sign — the
    // symbol follows `money.currency`, which is the whole point of carrying it.
    const formatted = formatMoney({ amountCents: 500, currency: "EUR" }, "en-US");
    expect(formatted).toContain("€");
    expect(formatted).not.toContain("$");
  });

  it("respects the presentation locale's grouping and symbol placement", () => {
    // de-DE groups with a dot and trails the symbol; the number is unchanged.
    const formatted = formatMoney({ amountCents: 123456, currency: "EUR" }, "de-DE");
    expect(formatted).toContain("1.234,56");
    expect(formatted).toContain("€");
  });
});
