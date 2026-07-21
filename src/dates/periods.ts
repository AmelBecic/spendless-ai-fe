// The period selector's source of truth (SLAI-27, AC "a period selector drives
// the from/to query params").
//
// Two deliberate choices, both from the dates section of the engineering
// checklist:
//
//   1. Boundaries are bare `YYYY-MM-DD` dates, not timestamps. The backend reads
//      an inclusive `to` as covering its whole UTC day, so a bare date is exactly
//      what "up to and including today" means. Slicing a `Date` to build a
//      timestamp is what the checklist warns against; a bare date sidesteps it.
//   2. Every boundary is computed in **UTC**. `from`/`to` are instants the
//      backend interprets in UTC; deriving them from the host's local calendar
//      would send a different window depending on where the browser runs.

/** Format a `Date` as a UTC `YYYY-MM-DD` — the whole-day form the backend wants. */
export function toISODate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A selectable window. `from`/`to` go straight onto the `/stats` query. */
export interface Period {
  id: string;
  label: string;
  /** Inclusive lower bound, `YYYY-MM-DD` (UTC). */
  from: string;
  /** Inclusive upper bound, `YYYY-MM-DD` (UTC) — covers its whole UTC day. */
  to: string;
}

/**
 * The presets the selector offers, anchored to a single `now` so every window
 * shares one `to`. `now` is injectable so the tests can pin a date rather than
 * race the wall clock across a UTC midnight.
 *
 * `Date.UTC` with an out-of-range day (e.g. `date - 29` on the 3rd) normalises
 * into the previous month, so the last-N windows need no manual month rollover.
 */
export function buildPeriods(now: Date = new Date()): [Period, ...Period[]] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  const to = toISODate(now);
  const firstOfMonth = toISODate(new Date(Date.UTC(year, month, 1)));
  // Inclusive windows: "last 7 days" is today plus the six before it.
  const sevenDaysAgo = toISODate(new Date(Date.UTC(year, month, day - 6)));
  const thirtyDaysAgo = toISODate(new Date(Date.UTC(year, month, day - 29)));

  return [
    { id: "this-month", label: "This month", from: firstOfMonth, to },
    { id: "last-7", label: "Last 7 days", from: sevenDaysAgo, to },
    { id: "last-30", label: "Last 30 days", from: thirtyDaysAgo, to },
  ];
}
