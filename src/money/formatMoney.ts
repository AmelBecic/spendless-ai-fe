// The other end of invariant 1: cents go in, a formatted string comes out, and
// this is the only place the division by minor units happens. Nothing upstream
// ever stores `amountCents / 100` — the moment a fractional value is put in
// state the precision the integer cents protected is already gone.
//
// The currency comes from the data (`Money.currency`), never from the browser
// locale: formatting a EUR amount with an en-US default prints a dollar sign on
// a euro figure.

import type { Money } from "../api/contract";

/** Same 2-exponent assumption as the parser — see parseAmount.ts. */
const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Format integer cents + currency for display.
 *
 * The division by 100 happens here, inside the formatter call, not in state.
 * `locale` is the presentation locale (digit grouping, symbol placement); the
 * currency itself always comes from `money.currency`.
 *
 *   { amountCents: 1250, currency: "EUR" } → "€12.50" (en-US) / "12,50 €" (de-DE)
 */
export function formatMoney(money: Money, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  }).format(money.amountCents / MINOR_UNITS_PER_MAJOR);
}
