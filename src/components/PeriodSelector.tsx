"use client";

// The period control (SLAI-27). It owns no data — it maps a choice to a period
// id and hands it up; the parent turns that into the `from`/`to` the stats
// request carries.

import type { Period } from "../dates/periods";
import { Label } from "./ui/label";
import { Select } from "./ui/select";

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
    <div className="flex max-w-xs flex-col gap-1.5">
      <Label htmlFor="period-select">Period</Label>
      <Select id="period-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {periods.map((period) => (
          <option key={period.id} value={period.id}>
            {period.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
