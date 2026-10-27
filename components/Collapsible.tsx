"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * A picker that gets out of the way.
 *
 * Twenty-four skill variations or twelve machines are what you need while
 * choosing and a wall of chips once you have chosen. It opens by default
 * when nothing has been logged yet and stays shut once something has, which
 * is the common case for the rest of a session — and either way the toggle
 * is yours, since the component never overrides a choice you have made.
 */
export function Collapsible({
  label,
  hint,
  startOpen,
  children,
}: {
  label: string;
  /** What the collapsed state is hiding, so the summary is worth reading. */
  hint?: string;
  startOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[36px] w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[11px] font-bold uppercase tracking-wide text-text-dim">
          {label}
          {hint && !open ? (
            <span className="ml-1.5 font-normal normal-case">{hint}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-[11px] underline underline-offset-2 text-text-dim">
          {open ? "Hide" : "Choose"}
        </span>
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
