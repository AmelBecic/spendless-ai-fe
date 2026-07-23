import * as React from "react";
import { cn } from "@/lib/utils";

// A native <select> styled to match Input. Enough for the app's short, fixed
// option lists (categories, cadence); a Radix listbox would be overkill here.
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 disabled:cursor-not-allowed disabled:opacity-55 aria-[invalid=true]:border-coral",
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = "Select";

export { Select };
