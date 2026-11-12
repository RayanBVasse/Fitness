"use client";

import { useRouter } from "next/navigation";
import { addDays } from "@/lib/time";

/**
 * Open any past day.
 *
 * A day that was never filled in could only be reached through the history
 * calendar, which meant finding the gap before you could go and close it.
 * This is the same journey in one control, on the two screens where you
 * notice a day is missing: today's, and another day's.
 *
 * The future is not offered. A date later than today has no facts in it,
 * and the day route refuses one anyway.
 */
export function DayPicker({
  date,
  today,
  label,
}: {
  /** The day being shown, which is where the arrows count from. */
  date: string;
  today: string;
  /** Shown before the control where it would not otherwise be obvious. */
  label?: string;
}) {
  const router = useRouter();

  // Today's own screen is "/", not "/day/<today>" — the day route is the
  // editor for a day that is over, and sending you to a second copy of
  // today would be two screens for one date.
  const open = (next: string) => router.push(next === today ? "/" : `/day/${next}`);

  const previous = addDays(date, -1);
  const next = date >= today ? null : addDays(date, 1);

  const step =
    "flex h-8 w-7 items-center justify-center rounded-[var(--radius)] border border-border " +
    "text-sm leading-none text-text-dim disabled:opacity-30";

  return (
    <div className="flex items-center gap-1.5">
      {label ? <span className="text-[11px] text-text-faint">{label}</span> : null}
      <button
        type="button"
        onClick={() => open(previous)}
        aria-label={`Open the day before, ${previous}`}
        className={step}
      >
        &lsaquo;
      </button>
      <input
        type="date"
        value={date}
        max={today}
        aria-label="Open another day"
        onChange={(event) => {
          // An empty value is the picker being cleared, not a date chosen.
          if (event.target.value) open(event.target.value);
        }}
        className="tnum h-8 rounded-[var(--radius)] border border-border bg-surface-2 px-2 text-xs"
      />
      <button
        type="button"
        disabled={next === null}
        onClick={() => next && open(next)}
        aria-label={next ? `Open the day after, ${next}` : "No day after today"}
        className={step}
      >
        &rsaquo;
      </button>
    </div>
  );
}
