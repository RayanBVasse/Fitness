"use client";

import { useState } from "react";
import { clearPasscode, setPasscode, usePasscode } from "@/lib/write";

/**
 * The site is readable by anyone with the link. Logging requires the passcode,
 * entered once per device. This is a write gate, not an identity check.
 */
export function PasscodeGate() {
  const stored = usePasscode();
  const [draft, setDraft] = useState("");

  if (stored) {
    return (
      <div className="flex items-center justify-between gap-3 text-[11px] text-text-faint">
        <span>Logging unlocked on this device.</span>
        <button type="button" onClick={clearPasscode} className="underline underline-offset-2">
          Lock
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const value = draft.trim();
        if (!value) return;
        setPasscode(value);
        setDraft("");
      }}
      className="flex gap-2"
    >
      <input
        type="password"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Passcode to log"
        autoComplete="current-password"
        className="min-h-[44px] flex-1 rounded-[var(--radius)] border border-border bg-surface-2 px-3 text-base"
        aria-label="Write passcode"
      />
      <button
        type="submit"
        className="min-h-[44px] rounded-[var(--radius)] px-4 text-sm font-semibold"
        style={{ background: "var(--accent)", color: "var(--accent-text)" }}
      >
        Unlock
      </button>
    </form>
  );
}
