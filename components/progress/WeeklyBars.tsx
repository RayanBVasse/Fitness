"use client";

import { useId, useState } from "react";

/**
 * One measure, by ISO week.
 *
 * Deliberately a small multiple rather than one stacked chart per section.
 * The palette here is family-based — every leg muscle is a green, every back
 * muscle a blue — which reads well beside a label and fails hard as adjacent
 * segments: red against green measures ΔE 3.8 for a deutan viewer, well under
 * the floor. One chart per entity, one hue each, and the problem does not
 * exist. The title names the series, so no legend is needed either.
 *
 * `part` is a portion OF `value`, not a second series: stood out of attempted,
 * working out of total. It is the same hue a step darker, so the pair is
 * separated by lightness, which survives colour blindness where hue does not.
 */

export interface WeekBar {
  week: string;
  value: number;
  /** The part of `value` worth distinguishing. Never greater than it. */
  part?: number;
}

/**
 * How to read the numbers. A name rather than a formatter function: this is a
 * client component, and a function cannot cross the boundary from the server
 * component that renders it — passing one makes the whole page fail to render.
 */
export type Unit = "count" | "kg" | "sets";

type Props = {
  title: string;
  hue: string;
  bars: WeekBar[];
  unit: Unit;
  /** What `part` means, named in the tooltip rather than left to colour. */
  partLabel?: string;
  /** Said instead of an empty chart. Zero bars is not zero training. */
  empty?: string;
};

const HEIGHT = 56;
const GAP = 2;

export function WeeklyBars({ title, hue, bars, unit, partLabel, empty }: Props) {
  const format = (value: number) => formatUnit(value, unit);
  const [selected, setSelected] = useState<number | null>(null);
  const id = useId();

  if (bars.length === 0) {
    return (
      <div>
        <ChartTitle hue={hue}>{title}</ChartTitle>
        <p className="text-[11px] text-text-dim">{empty ?? "Nothing recorded in this window."}</p>
      </div>
    );
  }

  const max = Math.max(...bars.map((b) => b.value), 1);
  const peak = bars.reduce((best, b, i) => (b.value > bars[best].value ? i : best), 0);
  const width = 100 / bars.length;
  const shown = selected !== null ? bars[selected] : null;

  return (
    <div>
      <ChartTitle hue={hue}>
        {title}
        <span className="ml-auto text-[11px] font-normal text-text-dim">
          {shown
            ? `${shortWeek(shown.week)} · ${format(shown.value)}${
                shown.part !== undefined && partLabel
                  ? ` · ${format(shown.part)} ${partLabel}`
                  : ""
              }`
            : `peak ${format(bars[peak].value)}`}
        </span>
      </ChartTitle>

      <svg
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-14 w-full"
        role="img"
        aria-labelledby={`${id}-t`}
      >
        {/* One string child, not three. React separates adjacent text nodes
            with comment markers, and cannot put them inside <title> — so a
            split like {title}: {list} renders differently on the server and
            the client, and every chart fails hydration. */}
        <title id={`${id}-t`}>
          {`${title}: ${bars.map((b) => `${shortWeek(b.week)} ${format(b.value)}`).join(", ")}`}
        </title>
        {bars.map((b, i) => {
          const h = (b.value / max) * (HEIGHT - 2);
          const partH = b.part === undefined ? 0 : (b.part / max) * (HEIGHT - 2);
          const x = i * width;
          const on = selected === i;
          return (
            <g key={b.week} onPointerDown={() => setSelected(on ? null : i)}>
              {/* A hit target the width of the slot, not of the mark. */}
              <rect x={x} y={0} width={width} height={HEIGHT} fill="transparent" />
              <rect
                x={x + GAP / 2}
                y={HEIGHT - h}
                width={Math.max(width - GAP, 0.5)}
                height={h}
                rx={0.8}
                fill={hue}
                opacity={b.part === undefined ? (on ? 1 : 0.85) : on ? 0.45 : 0.3}
              />
              {b.part !== undefined ? (
                <rect
                  x={x + GAP / 2}
                  y={HEIGHT - partH}
                  width={Math.max(width - GAP, 0.5)}
                  height={partH}
                  rx={0.8}
                  fill={hue}
                  opacity={on ? 1 : 0.85}
                />
              ) : null}
            </g>
          );
        })}
        {/* Recessive baseline: the chart sits on it rather than floating. */}
        <line x1="0" y1={HEIGHT} x2="100" y2={HEIGHT} stroke="var(--border)" strokeWidth="0.5" />
      </svg>

      <div className="flex justify-between text-[10px] text-text-dim">
        <span className="tnum">{shortWeek(bars[0].week)}</span>
        <span className="tnum">{shortWeek(bars[bars.length - 1].week)}</span>
      </div>
    </div>
  );
}

function ChartTitle({ hue, children }: { hue: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: hue }} aria-hidden />
      <span className="flex w-full items-baseline gap-1.5 text-[11px] font-semibold">
        {children}
      </span>
    </div>
  );
}

function formatUnit(value: number, unit: Unit): string {
  if (unit === "kg") {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}t` : `${Math.round(value)} kg`;
  }
  if (unit === "sets") {
    return `${value} set${value === 1 ? "" : "s"}`;
  }
  return String(Math.round(value));
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * 2026-10-26 -> 26 Oct. Weeks are named by their Monday.
 *
 * Spelled out rather than left to toLocaleString, which abbreviates September
 * as "Sept" under Node's ICU and "Sep" in Chrome — a hydration mismatch on
 * every chart label for one month of the year.
 */
function shortWeek(week: string): string {
  const [y, m, d] = week.split("-").map(Number);
  void y;
  return `${d} ${MONTHS[m - 1] ?? m}`;
}
