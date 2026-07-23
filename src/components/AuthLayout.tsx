// The chrome shared by every pre-auth screen: the brand mark over a centered
// column, with an optional footer line beneath the card.

import type { ReactNode } from "react";

export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span
            className="h-8 w-8 rounded-[10px] bg-gradient-to-br from-teal to-coral"
            aria-hidden="true"
          />
          <span className="font-display text-lg font-semibold text-ink">SpendLess</span>
        </div>
        {children}
        {footer ? <p className="mt-4 text-center text-sm text-muted">{footer}</p> : null}
      </div>
    </div>
  );
}
