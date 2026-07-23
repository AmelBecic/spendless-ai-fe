"use client";

// The AI-mode switch. Renders nothing until the server confirms it supports AI —
// server capability wins over user preference, so there is no toggle on a server
// started without a model key.

import { useAiMode } from "../ai/AiModeProvider";
import { Switch } from "./ui/switch";

export function AiModeToggle({ showHint = false }: { showHint?: boolean }) {
  const { serverAiAvailable, userEnabled, setUserEnabled } = useAiMode();

  // Loading (null) or unavailable (false) → no switch at all.
  if (serverAiAvailable !== true) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <Switch
          checked={userEnabled}
          onCheckedChange={setUserEnabled}
          aria-label="Toggle AI mode"
        />
        <span className="text-sm font-medium text-ink">AI mode</span>
      </div>
      {showHint ? (
        <span className="text-xs text-muted">
          {userEnabled
            ? "On — your profile and grounded suggestions are shown."
            : "Off — expense tracking only. Turn on for your profile and savings suggestions."}
        </span>
      ) : null}
    </div>
  );
}
