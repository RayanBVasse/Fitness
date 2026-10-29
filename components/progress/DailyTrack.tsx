"use client";

import { useState } from "react";

/**
 * One daily reading across the window, as dots.
 *
 * Spaced by calendar date, not by position in the list — unlike the weekly
 * charts, where only weeks with records appear. Here the gaps are the point:
 * four days without a reading and four days of nothing to report look the
 * same in a list and are entirely different things, so the space between the
 * dots is real time.
 *
 * Nothing is averaged and nothing is joined by a line. These are single daily
 * judgements; a line between two of them asserts the days in between, and
 * those days are exactly what is missing.
 *
 * Positioned HTML rather than SVG, for the reason QualityDots gives: these
 * stretch to the container, and a stretched circle is an ellipse.
 */

export interface DayPoint {
  date: string;
  value: number;
}

type Props = {
  title: string;
  hue: string;
  from: string;
  to: string;
  max: number;
  points: DayPoint[];
  /** What the numbers are, for the tap readout. */
  unit?: string;
};

const HEIGHT = 56;

export function DailyTrack({ title, hue, from, to, max, points, unit }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  if (points.length === 0) return null;

  const span = Math.max(1, days(from, to));
  const shown = points.find((p) => p.date === selected) ?? null;
  const values = points.map((p) => p.value);

  return (
    <div>
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: hue }} aria-hidden />
        <span className="text-[11px] font-semibold">{title}</span>
        <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] font-normal text-text-dim">
          {shown
            ? `${shortDate(shown.date)} · ${fmt(shown.value)}${unit ?? ""}`
            : `${fmt(Math.min(...values))}–${fmt(Math.max(...values))}${unit ?? ""} over ${points.length} day${
                points.length === 1 ? "" : "s"
              }`}
        </span>
      </div>

      <div className="flex gap-1.5">
        <div
          // Wide enough for a five-figure step count, and the same width on
          // every track: a gutter that sized itself to its own label would
          // start each chart at a different place, and these are read
          // against each other.
          className="tnum flex w-10 shrink-0 flex-col justify-between text-right text-[9px] leading-none text-text-faint"
          style={{ height: HEIGHT }}
          aria-hidden
        >
          <span>{fmt(max)}</span>
          <span>0</span>
        </div>

        <div
          className="relative flex-1"
          style={{ height: HEIGHT }}
          role="img"
          aria-label={`${title}: ${points
            .map((p) => `${shortDate(p.date)} ${fmt(p.value)}`)
            .join("; ")}`}
        >
          {[0, max].map((v) => (
            <div
              key={v}
              className="absolute inset-x-0 h-px"
              style={{ bottom: `${(v / max) * 100}%`, background: "var(--border)" }}
              aria-hidden
            />
          ))}

          {points.map((p) => {
            const on = selected === p.date;
            const left = 2 + (days(from, p.date) / span) * 96;
            return (
              <button
                key={p.date}
                type="button"
                onClick={() => setSelected(on ? null : p.date)}
                aria-label={`${shortDate(p.date)}, ${fmt(p.value)}`}
                className="absolute top-0 h-full -translate-x-1/2"
                style={{ left: `${left}%`, width: 22 }}
              >
                <span
                  className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full"
                  style={{
                    background: hue,
                    bottom: `${(Math.min(p.value, max) / max) * 100}%`,
                    opacity: on ? 1 : 0.85,
                    boxShadow: "0 0 0 2px var(--surface)",
                  }}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="ml-[46px] mt-1 flex justify-between text-[10px] text-text-dim">
        <span className="tnum">{shortDate(from)}</span>
        <span className="tnum">{shortDate(to)}</span>
      </div>
    </div>
  );
}

/**
 * Four figures and up get separators; everything else is left alone.
 *
 * At a thousand rather than ten thousand, so one chart cannot show 4312
 * beside 18,400 — a scale that punctuates some of its numbers and not
 * others reads as two different quantities.
 *
 * Spelled out rather than left to toLocaleString, for the reason the month
 * names are: the server and the browser can disagree about a locale, and a
 * label that differs between them fails hydration.
 */
function fmt(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 1000) return String(rounded);
  const [whole, fraction] = String(rounded).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

function days(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Spelled out: Node and Chrome disagree about September, and a label that
 *  differs between server and client fails hydration. */
function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? m}`;
}
