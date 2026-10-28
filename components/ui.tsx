import type { CSSProperties, ReactNode } from "react";
import type { Workstream } from "@/lib/types";

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section
      className={`rounded-[var(--radius)] border border-border bg-surface p-4 ${className}`}
      style={style}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  aside,
  tone,
}: {
  children: ReactNode;
  aside?: ReactNode;
  /** A CSS colour, normally a workstream token, when the section has a hue. */
  tone?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2
        className="text-[11px] font-bold uppercase tracking-[0.08em]"
        style={{ color: tone ?? "var(--text-dim)" }}
      >
        {children}
      </h2>
      {aside ? <div className="text-[11px] text-text-faint">{aside}</div> : null}
    </div>
  );
}

/**
 * A workstream's colour, and a muscle's. Both fall back to the neutral border
 * rather than resolving to nothing: an exercise with no muscle group, or a
 * group seeded after these tokens were written, must still render.
 */
export const wsColour = (workstream: Workstream) =>
  `var(--ws-${workstream}, var(--text-dim))`;
export const mgColour = (slug?: string | null) =>
  slug ? `var(--mg-${slug}, var(--border))` : "var(--border)";

/**
 * An outline chip that lights up in its own hue when on.
 *
 * The on state is an 8% wash rather than a fill. A fill would put the hue
 * behind text of the same hue and cost about a point of contrast, which the
 * lighter end of each family cannot spare.
 */
export function Chip({
  on,
  hue = "var(--text)",
  className = "",
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean; hue?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      {...rest}
      className={`min-h-[38px] rounded-full border px-3 text-xs font-semibold disabled:opacity-40 ${className}`}
      style={{
        borderColor: on ? hue : `color-mix(in oklab, ${hue} 32%, transparent)`,
        background: on ? `color-mix(in oklab, ${hue} 8%, transparent)` : "transparent",
        color: on ? hue : "var(--text-dim)",
      }}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="tnum text-xl font-semibold leading-tight">{value}</div>
      {hint ? <div className="text-[11px] text-text-faint">{hint}</div> : null}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "stood" | "caught" | "missed" | "accent";
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    neutral: { bg: "var(--surface-2)", fg: "var(--text-dim)" },
    stood: { bg: "var(--stood-bg)", fg: "var(--stood)" },
    caught: { bg: "var(--caught-bg)", fg: "var(--caught)" },
    missed: { bg: "var(--missed-bg)", fg: "var(--missed)" },
    accent: { bg: "var(--surface-2)", fg: "var(--accent)" },
  };
  const { bg, fg } = tones[tone];
  return (
    <span
      className="tnum inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm text-text-faint">{children}</p>;
}

/**
 * The fewest attempts a percentage may be drawn from.
 *
 * One rule, in one place, because a rate suppressed on one screen and shown
 * on another is worse than no rule at all. Below this, the counts are given
 * and the percentage is not: at five attempts a single lift moves the figure
 * twenty points, which is a number about luck rather than about standing.
 */
export const MIN_ATTEMPTS_FOR_RATE = 8;

/**
 * Shown wherever a figure cannot be computed. The rule across this app is to
 * say so rather than to infer a number from partial counts.
 */
export function InsufficientData({ reason }: { reason?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-border px-3 py-2">
      <div className="text-[11px] font-bold uppercase tracking-wide text-text-faint">
        Insufficient data
      </div>
      {reason ? <div className="mt-0.5 text-xs text-text-dim">{reason}</div> : null}
    </div>
  );
}
