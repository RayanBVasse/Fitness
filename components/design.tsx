"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Workstream } from "@/lib/types";

/**
 * The 2c pieces: the pill, the sticky note, the scoreboard tile.
 *
 * Colour comes from the workstream or the muscle and never from a list
 * position, which is the whole point of the token set these read from.
 *
 * On the two hues that measure close: snatch 230 and hypertrophy 292 sit at
 * dE 4.7 deutan in light and 1.1 in dark. Every surface here that carries a
 * workstream colour also carries its written name — the tile has a title,
 * the tab has a label, the chip has its text. Nothing asks you to tell two
 * of them apart by colour to read a number, and that is the condition under
 * which this palette is legible.
 */

/** The four variants each workstream token comes in. */
export const ws = (w: Workstream) => ({
  solid: `var(--ws-${w})`,
  fg: `var(--ws-${w}-fg)`,
  tint: `var(--ws-${w}-tint)`,
  line: `var(--ws-${w}-line)`,
});

export const outcome = (o: "stood" | "caught" | "missed") => ({
  solid: `var(--oc-${o})`,
  fg: `var(--oc-${o}-fg)`,
  tint: `var(--oc-${o}-tint)`,
});

/* -------------------------------------------------------------------------
 * Chip
 * ---------------------------------------------------------------------- */

type ChipProps = {
  on?: boolean;
  /** Colours the chip by workstream. Omitted for a neutral chip. */
  workstream?: Workstream;
  size?: "sm" | "md";
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  children: ReactNode;
};

export function Chip({
  on = false,
  workstream,
  size = "md",
  disabled,
  onClick,
  title,
  children,
}: ChipProps) {
  const c = workstream ? ws(workstream) : null;
  const metrics =
    size === "md"
      ? "h-[34px] px-[13px] text-[12.5px]"
      : "h-[24px] px-[9px] text-[11px]";

  const style: CSSProperties = c
    ? on
      ? { background: c.solid, borderColor: c.solid, color: "var(--accent-text)", fontWeight: 700 }
      : { background: c.tint, borderColor: c.line, color: c.fg }
    : on
      ? { background: "var(--surface-2)", borderColor: "var(--text)", borderWidth: 1.5 }
      : { background: "transparent", borderColor: "var(--border)", color: "var(--text-dim)" };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-pressed={onClick ? on : undefined}
      // A 34px pill is below the 44px target, so the hit area is extended
      // past the ink rather than the pill being drawn bigger than the mock.
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full border font-semibold leading-none disabled:opacity-40 ${metrics} ${
        size === "md" && onClick
          ? "after:absolute after:inset-x-0 after:top-1/2 after:h-[44px] after:-translate-y-1/2 after:content-['']"
          : ""
      }`}
      style={style}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------
 * StickyNote
 * ---------------------------------------------------------------------- */

export function StickyNote({
  label,
  tag,
  onEdit,
  onDelete,
  children,
  className = "",
}: {
  label: string;
  /** A small workstream chip, e.g. Snatch on an experiment note. */
  tag?: Workstream;
  onEdit?: () => void;
  onDelete?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      // The one corner that is not rounded is the bottom-left, which is what
      // makes it read as a peeled note rather than a card.
      className={`border p-3 ${className}`}
      style={{
        background: "var(--note-bg)",
        borderColor: "var(--note-border)",
        borderRadius: "4px 4px 4px 18px",
        boxShadow: "0 8px 16px -10px rgb(90 70 0 / .45)",
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className="text-[10.5px] font-bold uppercase tracking-wide"
          style={{ color: "var(--note-ink-dim)" }}
        >
          {label}
        </span>
        {tag ? (
          <Chip size="sm" workstream={tag}>
            {tag[0].toUpperCase() + tag.slice(1)}
          </Chip>
        ) : null}
        {onEdit || onDelete ? (
          <span className="ml-auto flex gap-2 text-[11px]">
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="underline underline-offset-2"
                style={{ color: "var(--note-ink-dim)" }}
              >
                edit
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="underline underline-offset-2"
                style={{ color: "var(--note-ink-dim)" }}
              >
                delete
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      <div className="text-[13.5px] leading-[1.5]" style={{ color: "var(--note-ink)" }}>
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * WorkstreamTile
 * ---------------------------------------------------------------------- */

export interface TileStat {
  label: string;
  /** Null is not zero: a figure nobody recorded shows as a dash. */
  value: string | null;
  sub?: string | null;
}

export function WorkstreamTile({
  workstream,
  title,
  stats,
  footer,
  active,
  onSelect,
}: {
  workstream: Workstream;
  title: string;
  stats: TileStat[];
  footer?: ReactNode;
  active?: boolean;
  onSelect?: () => void;
}) {
  const c = ws(workstream);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={onSelect ? !!active : undefined}
      className="flex h-full w-full flex-col gap-2 border p-[10px_12px] text-left"
      style={{
        background: c.tint,
        borderColor: active ? c.solid : c.line,
        borderRadius: 12,
        boxShadow: active ? `inset 0 3px 0 ${c.solid}` : undefined,
        padding: "10px 12px",
      }}
    >
      <span className="text-[12px] font-extrabold uppercase tracking-wide" style={{ color: c.fg }}>
        {title}
      </span>

      <span className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <span key={s.label} className="block">
            <span className="block text-[10px] uppercase tracking-wide" style={{ color: c.fg }}>
              {s.label}
            </span>
            <span className="tnum block text-[19px] font-extrabold leading-tight">
              {s.value ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
            </span>
            {s.sub ? (
              <span className="block text-[10.5px]" style={{ color: "var(--text-dim)" }}>
                {s.sub}
              </span>
            ) : null}
          </span>
        ))}
      </span>

      {footer ? <span className="mt-auto flex flex-wrap gap-1 pt-1">{footer}</span> : null}
    </button>
  );
}

/** A footer pill: white in light, a wash of white in dark. */
export function TilePill({
  workstream,
  children,
}: {
  workstream: Workstream;
  children: ReactNode;
}) {
  return (
    <span
      className="tnum inline-flex h-[22px] items-center rounded-full border px-2 text-[10.5px] font-semibold"
      style={{
        background: "var(--tile-pill-bg)",
        borderColor: `var(--ws-${workstream}-line)`,
        color: "var(--text-dim)",
      }}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------
 * MuscleBar
 * ---------------------------------------------------------------------- */

/**
 * Sets per muscle, as one stacked bar.
 *
 * Built as drawn in 2c and worth knowing what it costs: the muscle families
 * measure dE 1.0 deutan between legs and push, so two segments can be the
 * same colour to a red-green colourblind reader, and dE 12.1 normal between
 * core and push. The 2px gaps separate the marks and the legend names every
 * one with its count, so the bar is a proportion you can see and the numbers
 * are read from the words beside it rather than from the colours.
 */
export function MuscleBar({
  segments,
}: {
  segments: { slug: string; name: string; sets: number }[];
}) {
  const total = segments.reduce((t, s) => t + s.sets, 0);
  if (total === 0) return null;

  return (
    <span className="block w-full">
      <span className="flex h-[7px] w-full gap-[2px]">
        {segments.map((s) => (
          <span
            key={s.slug}
            className="block rounded-[2px]"
            style={{
              width: `${(s.sets / total) * 100}%`,
              background: `var(--mg-${s.slug}, var(--border))`,
            }}
          />
        ))}
      </span>
      <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
        {segments.map((s) => (
          <span
            key={s.slug}
            className="tnum inline-flex items-center gap-1 text-[10px]"
            style={{ color: "var(--text-dim)" }}
          >
            <span
              className="inline-block h-[6px] w-[6px] rounded-full"
              style={{ background: `var(--mg-${s.slug}, var(--border))` }}
              aria-hidden
            />
            {s.name} {s.sets}
          </span>
        ))}
      </span>
    </span>
  );
}
