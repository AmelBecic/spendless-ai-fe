"use client";

// The period control (SLAI-27). It owns no data — it maps a choice to a period
// id and hands it up; the parent turns that into the `from`/`to` the stats
// request carries. Kept a plain labelled <select> so it is keyboard- and
// screen-reader-navigable without a design system in place yet.

import type { Period } from "../dates/periods";

export function PeriodSelector({
  periods,
  value,
  onChange,
}: {
  periods: Period[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="field period-selector">
      <label htmlFor="period-select">Period</label>
      <select
        id="period-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {periods.map((period) => (
          <option key={period.id} value={period.id}>
            {period.label}
          </option>
        ))}
      </select>
    </div>
  );
}
