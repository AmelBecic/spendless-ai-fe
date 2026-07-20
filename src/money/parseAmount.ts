// The single edge where free text becomes money.
//
// Client invariant 1 (CLAUDE.md): a currency input parses to integer cents
// exactly once, here, and no `parseFloat` on an amount ever reaches state or the
// API. `parseFloat("0.1") + parseFloat("0.2")` is why — the moment an amount
// lives as a float, `12.30` can already be `12.299999999999999`. So this parser
// never builds a fractional Number from the whole amount: it validates the two
// integer halves as strings and combines them with integer arithmetic.
//
// The result is a discriminated union, not a `number | null`, because "empty"
// and "invalid" are different answers the form renders differently: empty is an
// absent-but-fine field, invalid is an error against the field.

import { INT4_MAX } from "../api/contract";

/** Minor units per major unit. Two decimal places — the currencies this app
 * handles (EUR, USD, …) are all 2-exponent. A 0-exponent currency like JPY
 * would need this to vary; that is out of scope for SLAI-26 and the whole app
 * speaks in `amountCents` today. */
const MINOR_UNITS_PER_MAJOR = 100;
const FRACTION_DIGITS = 2;

export type ParsedAmount =
  /** Valid. `cents` is `undefined` only for empty input — an absent field. */
  | { ok: true; cents: number | undefined }
  /** Invalid. `reason` is written for the user, shown against the field. */
  | { ok: false; reason: string };

/**
 * Parse a free-text amount to integer cents, or reject it.
 *
 * Accepts an optional leading currency symbol/whitespace and either `.` or `,`
 * as the decimal separator (never both — `"1,234.50"` is ambiguous grouping and
 * is rejected rather than guessed). Rejects, rather than rounds, more precision
 * than the currency has: `"12.345"` is a mistake to surface, not to silently
 * truncate to `12.34`.
 *
 *   ""        → { ok: true, cents: undefined }   (absent)
 *   "12.5"    → { ok: true, cents: 1250 }
 *   "12,50"   → { ok: true, cents: 1250 }
 *   "12.345"  → { ok: false, ... }               (too precise — not rounded)
 *   "-5"      → { ok: false, ... }               (must be positive)
 *   "0"       → { ok: false, ... }               (backend requires > 0)
 */
export function parseAmountToCents(raw: string): ParsedAmount {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, cents: undefined };

  // Strip a leading currency symbol or a single space after it, so a user who
  // types "$12.50" or "€ 12,50" is not punished for it. Digits/sep/sign only
  // from here on — anything else is a hard reject rather than a lenient parse.
  const cleaned = trimmed.replace(/^[^\d,.\-]+/, "").trim();

  if (cleaned.startsWith("-")) {
    return { ok: false, reason: "Enter a positive amount." };
  }

  // At most one separator, digits on both sides where present. `.5` and `5.`
  // are rejected as malformed rather than read as `0.50` / `5.00` — a money
  // field should not be that lenient.
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(cleaned);
  if (!match) {
    return { ok: false, reason: "Enter an amount like 12.50." };
  }

  const [, whole = "", fraction = ""] = match;

  if (fraction.length > FRACTION_DIGITS) {
    return { ok: false, reason: `Use at most ${FRACTION_DIGITS} decimal places.` };
  }

  // A whole part longer than INT4_MAX's digit count cannot be in range, and
  // `Number()` on a very long digit string loses precision — bail before that.
  if (whole.length > 10) {
    return { ok: false, reason: "That amount is too large." };
  }

  // Integer arithmetic only: `Number()` runs on the two integer substrings, not
  // on the decimal amount as a whole. `padEnd` scales the fraction to full minor
  // units ("5" → "50" → 50). This is the "parse once, at the edge" the invariant
  // sanctions — not a running total, which invariant 2 forbids.
  const wholeCents = Number(whole) * MINOR_UNITS_PER_MAJOR;
  const fractionCents = fraction === "" ? 0 : Number(fraction.padEnd(FRACTION_DIGITS, "0"));
  const cents = wholeCents + fractionCents;

  if (!Number.isSafeInteger(cents)) {
    return { ok: false, reason: "That amount is too large." };
  }
  if (cents <= 0) {
    return { ok: false, reason: "Enter an amount greater than zero." };
  }
  if (cents > INT4_MAX) {
    return { ok: false, reason: "That amount is too large." };
  }

  return { ok: true, cents };
}

/**
 * The inverse, for seeding an edit form: integer cents → the decimal string a
 * user edits. A display concern (invariant 1 permits formatting at render), and
 * a round-trip with `parseAmountToCents`: what this produces parses back to the
 * same cents. Not for display of totals — use `formatMoney` for that.
 */
export function centsToAmountInput(cents: number): string {
  return (cents / MINOR_UNITS_PER_MAJOR).toFixed(FRACTION_DIGITS);
}
