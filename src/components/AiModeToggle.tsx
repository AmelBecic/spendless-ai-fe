"use client";

// The AI-mode switch. Renders nothing until the server confirms it supports AI —
// server capability wins over user preference, so there is no toggle to show on a
// server started without a model key. Visual polish lands with the Sprint 5
// redesign; this is layout + behaviour only.

import { useAiMode } from "../ai/AiModeProvider";

export function AiModeToggle() {
  const { serverAiAvailable, userEnabled, setUserEnabled } = useAiMode();

  // Loading (null) or unavailable (false) → no switch at all.
  if (serverAiAvailable !== true) return null;

  return (
    <p className="ai-mode-toggle">
      <label>
        <input
          type="checkbox"
          checked={userEnabled}
          onChange={(e) => setUserEnabled(e.target.checked)}
        />{" "}
        AI mode
      </label>{" "}
      <span className="ai-mode-toggle__hint">
        {userEnabled
          ? "On — your profile and grounded suggestions are shown."
          : "Off — expense tracking only. Turn on for your profile and savings suggestions."}
      </span>
    </p>
  );
}
