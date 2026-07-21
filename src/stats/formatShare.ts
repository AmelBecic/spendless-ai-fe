// The same "format at render, never compute" discipline as formatMoney, applied
// to a category's share.
//
// `CategoryTotal.share` arrives as a fraction in 0..1. Rendering it as a
// percentage must NOT multiply by 100 here: that would be the client computing a
// figure the agent cites (invariant 2, and the AC's "no locally computed …
// percentages"). `Intl.NumberFormat` with `style: "percent"` takes the fraction
// and does the presentation itself — the multiply lives in the formatter, never
// in our state, exactly as the `/100` lives inside formatMoney.

/**
 * Format a 0..1 fraction as a percentage string.
 *
 *   0.45  → "45%"   ·   0.333 → "33.3%"   ·   1 → "100%"
 *
 * `locale` is presentation only (digit grouping, symbol). One fractional digit
 * keeps a small share from rounding to "0%" without turning the figure noisy.
 */
export function formatShare(fraction: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(fraction);
}
