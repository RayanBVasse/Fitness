import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[var(--radius)] border border-border bg-surface p-4 ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-dim">
        {children}
      </h2>
      {aside ? <div className="text-[11px] text-text-faint">{aside}</div> : null}
    </div>
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
