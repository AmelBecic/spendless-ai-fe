import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors placeholder:text-muted focus-visible:border-teal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 disabled:cursor-not-allowed disabled:opacity-55 aria-[invalid=true]:border-coral",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
