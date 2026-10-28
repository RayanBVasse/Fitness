"use client";

import { useState } from "react";

/**
 * Technical quality at one load, every rating shown.
 *
 * Nothing is averaged. A quality score is a 1–10 judgement made two or three
 * times a week; the mean of three opinions is not a measurement, and a line
 * drawn through it reads as a direction the data cannot carry. Each rated
 * block is a dot at its own value, so a week of 4, 7 and 8 looks like a week
 * of 4, 7 and 8 rather than like a 6.3.
 *
 * The spread is the finding. "Is 45 kg becoming smooth" is a question about
 * the dots gathering, not about the middle of them rising — a week that goes
 * 7, 7, 7 is a different report from one that goes 4, 7, 10 with the same
 * average, and only one of them is consolidation.
 *
 * Drawn as positioned HTML rather than SVG: these charts stretch to the
 * container with preserveAspectRatio="none", which turns a circle into an
 * ellipse. Divs do not distort, and each dot is a real hit target.
 *
 * A week with no rated block draws nothing. A gap is a gap — it is not a
 * quality of zero, and there is no zero on this scale to confuse it with.
 */

export interface QualityWeek {
  week: string;
  /** Every rating in that week, one per block. Never pre-averaged. */
  qualities: number[];
}

type Props = {
  title: string;
  hue: string;
  weeks: QualityWeek[];
  /** Blocks at this load, and how many carry a rating. */
  blocks: number;
  rated: number;
};

const HEIGHT = 76;
/** The scale is fixed 1–10 across every load, so the charts are comparable. */
const LOW = 1;
const HIGH = 10;

export function QualityDots({ title, hue, weeks, blocks, rated }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  if (rated === 0) {
    return (
      <div>
        <Title hue={hue} title={title} aside={`${blocks} blocks, none rated`} />
        <p className="text-[11px] text-text-dim">
          No technical quality recorded at this load. Not rated is not a low score.
        </p>
      </div>
    );
  }

  const shown = selected === null ? null : weeks.find((w) => w.week === selected);
  const all = weeks.flatMap((w) => w.qualities);
  const lowest = Math.min(...all);
  const highest = Math.max(...all);

  return (
    <div>
      <Title
        hue={hue}
        title={title}
        aside={
          shown
            ? `${shortWeek(shown.week)} · ${[...shown.qualities].sort((a, b) => a - b).join(", ")}`
            : rated === 1
              ? `rated ${lowest}`
              : `${lowest}–${highest} across ${rated} rated`
        }
      />

      <div className="flex gap-1.5">
        {/* The scale, named. Without it a dot's height means nothing in
            absolute terms, and a reader cannot tell a 7 from a 9. Two labels
            rather than ten: the ends fix the scale, and the exact values are
            a tap away. */}
        <div
          className="tnum flex w-4 shrink-0 flex-col justify-between text-right text-[9px] leading-none text-text-faint"
          style={{ height: HEIGHT }}
          aria-hidden
        >
          <span>{HIGH}</span>
          <span>{LOW}</span>
        </div>

        <div
          className="relative flex-1"
          style={{ height: HEIGHT }}
          role="img"
          aria-label={`${title}, technical quality out of 10: ${weeks
            .map((w) => `${shortWeek(w.week)} rated ${w.qualities.join(", ")}`)
            .join("; ")}`}
        >
          {/* Recessive guides at the ends of the scale and its middle. */}
          {[LOW, 5, HIGH].map((value) => (
            <div
              key={value}
              className="absolute inset-x-0 h-px"
              style={{
                bottom: `${pct(value)}%`,
                background: "var(--border)",
                opacity: value === 5 ? 0.5 : 1,
              }}
              aria-hidden
            />
          ))}

          {weeks.map((w) => {
            const on = selected === w.week;
            const left = position(weeks, w.week);
            const placed = dodge(w.qualities);
            return (
              <button
                key={w.week}
                type="button"
                onClick={() => setSelected(on ? null : w.week)}
                aria-label={`Week of ${shortWeek(w.week)}, rated ${w.qualities.join(", ")}`}
                // A hit target the height of the plot and wide enough for a
                // thumb, centred on the column of dots.
                className="absolute top-0 h-full -translate-x-1/2"
                style={{ left: `${left}%`, width: 36 }}
              >
                {/* The run of the week's ratings, so several dots read as one
                    week rather than as scattered marks. */}
                {w.qualities.length > 1 && lowOf(w) !== highOf(w) ? (
                  <span
                    className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded-full"
                    style={{
                      background: hue,
                      opacity: on ? 0.55 : 0.3,
                      bottom: `${pct(lowOf(w))}%`,
                      height: `${pct(highOf(w)) - pct(lowOf(w))}%`,
                    }}
                    aria-hidden
                  />
                ) : null}

                {placed.map((p, i) => (
                  <span
                    key={i}
                    className="absolute left-1/2 h-2.5 w-2.5 translate-y-1/2 rounded-full"
                    style={{
                      background: hue,
                      bottom: `${pct(p.value)}%`,
                      // Two blocks rated the same in one week sit at the same
                      // height and would stack into one mark — so they are
                      // nudged apart. Three 7s must look like three 7s.
                      transform: `translateX(calc(-50% + ${p.offset}px))`,
                      opacity: on ? 1 : 0.85,
                      boxShadow: "0 0 0 2px var(--surface)",
                    }}
                    aria-hidden
                  />
                ))}
              </button>
            );
          })}
        </div>
      </div>

      {/* One week puts its label under its dot, in the middle. A first and
          last date that are the same reads as a range that is not one. */}
      <div
        className={`ml-[22px] mt-1 flex items-baseline text-[10px] text-text-dim ${
          weeks.length === 1 ? "justify-center gap-2" : "justify-between"
        }`}
      >
        <span className="tnum">
          {weeks.length === 1 ? `week of ${shortWeek(weeks[0].week)}` : shortWeek(weeks[0].week)}
        </span>
        {rated < blocks ? (
          <span className="text-text-faint">
            {rated} of {blocks} rated
          </span>
        ) : null}
        {weeks.length > 1 ? (
          <span className="tnum">{shortWeek(weeks[weeks.length - 1].week)}</span>
        ) : null}
      </div>
    </div>
  );
}

const lowOf = (w: QualityWeek) => Math.min(...w.qualities);
const highOf = (w: QualityWeek) => Math.max(...w.qualities);

/**
 * Spread repeated ratings sideways.
 *
 * Two blocks rated 3 in the same week land on the same point and overlap
 * exactly, so the week reads as one block. Nudging each copy off centre makes
 * the count visible, which is the whole reason the raw ratings are drawn
 * rather than a summary of them.
 */
function dodge(qualities: number[]): { value: number; offset: number }[] {
  const seen = new Map<number, number>();
  const total = new Map<number, number>();
  for (const q of qualities) total.set(q, (total.get(q) ?? 0) + 1);

  return qualities.map((value) => {
    const index = seen.get(value) ?? 0;
    seen.set(value, index + 1);
    const count = total.get(value) ?? 1;
    return { value, offset: count === 1 ? 0 : (index - (count - 1) / 2) * 8 };
  });
}

/** Where a value sits on the 1–10 scale, as a percentage from the bottom. */
function pct(value: number): number {
  const clamped = Math.min(Math.max(value, LOW), HIGH);
  return ((clamped - LOW) / (HIGH - LOW)) * 100;
}

/**
 * Where a week sits across the plot.
 *
 * Weeks are spaced evenly by position in the list, not by date. Only weeks
 * with a rating appear at all, so spacing them by date would leave a chart
 * that is mostly gap — and the question here is the sequence of sessions,
 * not the calendar distance between them.
 */
function position(weeks: QualityWeek[], week: string): number {
  if (weeks.length === 1) return 50;
  const index = weeks.findIndex((w) => w.week === week);
  // Inset from both edges so an end dot is not clipped by the container.
  return 8 + (index / (weeks.length - 1)) * 84;
}

function Title({ hue, title, aside }: { hue: string; title: string; aside: string }) {
  return (
    <div className="mb-1 flex items-baseline gap-1.5">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: hue }} aria-hidden />
      <span className="text-[11px] font-semibold">{title}</span>
      <span className="ml-auto text-[11px] font-normal text-text-dim">{aside}</span>
    </div>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** 2026-10-26 -> 26 Oct. Spelled out for the reason WeeklyBars gives: Node
 *  and Chrome disagree about September, and a chart label that differs
 *  between server and client fails hydration. */
function shortWeek(week: string): string {
  const [, m, d] = week.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? m}`;
}
