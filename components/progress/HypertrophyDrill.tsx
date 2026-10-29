"use client";

import { useState } from "react";
import type { ExerciseDetail, SetEntry, Setup } from "@/lib/queries";
import type { MuscleGroup, MuscleRegion } from "@/lib/types";
import { mgColour } from "@/components/ui";

/**
 * Region, then muscle, then exercise, then the machine it was done on.
 *
 * The last step is the one that matters. A load means nothing on its own —
 * 45 kg on a cable and 45 kg on a plate-loaded machine are different
 * resistances wearing the same number — so the comparable unit is the setup:
 * one exercise, one machine, one gym. Nothing is ever summed across setups,
 * which is why a change of gym cannot read as a change of strength.
 *
 * Within a setup, sessions that share a load are compared directly. That is
 * the question this screen exists for: six reps at RIR 2 in October and four
 * at RIR 0 in November are the same weight and not the same performance, and
 * neither a volume total nor a set count would show it.
 *
 * The comparison is shown, never concluded. Two sessions at a load is two
 * sessions; sleep, order in the workout and how the day went are all absent
 * from it, and the screen says so rather than calling a drop a decline.
 */

/** The bucket for exercises whose muscle group sits in no region. Not a
 *  slug anything in the database carries, and never shown as one. */
const LOOSE = "__loose";

type Props = {
  regions: MuscleRegion[];
  muscleGroups: MuscleGroup[];
  detail: ExerciseDetail[];
};

export function HypertrophyDrill({ regions, muscleGroups, detail }: Props) {
  const [region, setRegion] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [exercise, setExercise] = useState<number | null>(null);

  const groupName = new Map(muscleGroups.map((g) => [g.slug, g.name]));
  const setsIn = (slugs: string[]) =>
    detail.filter((d) => slugs.includes(d.group)).reduce((t, d) => t + d.sets, 0);

  if (detail.length === 0) return null;

  // Groups that were actually worked, in the order the region lists them. A
  // region's full roster would offer muscles with nothing behind them.
  const openRegion = regions.find((r) => r.slug === region) ?? null;
  const groupsWorked = openRegion
    ? openRegion.groups.filter((slug) => detail.some((d) => d.group === slug))
    : [];
  const exercises = group ? detail.filter((d) => d.group === group) : [];
  const open = exercise == null ? null : (detail.find((d) => d.exerciseId === exercise) ?? null);

  // Exercises whose muscle group is in no region, which would otherwise be
  // unreachable: an exercise with no group, or a group added after the
  // regions setting was written.
  const placed = new Set(regions.flatMap((r) => r.groups));
  const loose = detail.filter((d) => !placed.has(d.group));

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
        By muscle and machine
      </p>

      {/* Breadcrumb doubles as the way back up. */}
      {region ? (
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <Crumb
            label="All"
            onClick={() => {
              setRegion(null);
              setGroup(null);
              setExercise(null);
            }}
          />
          <span className="text-text-faint">›</span>
          <Crumb
            label={region === LOOSE ? "Not in a region" : (openRegion?.name ?? region)}
            current={exercise == null && (!group || group === LOOSE)}
            onClick={() => {
              if (region === LOOSE) setExercise(null);
              else setGroup(null);
              setExercise(null);
            }}
          />
          {/* The loose bucket is one level, not two: its region and its group
              are the same sentinel, and showing it twice would put an
              internal slug on screen as if it were a muscle. */}
          {group && group !== LOOSE ? (
            <>
              <span className="text-text-faint">›</span>
              <Crumb
                label={groupName.get(group) ?? group}
                current={exercise == null}
                onClick={() => setExercise(null)}
              />
            </>
          ) : null}
          {open ? (
            <>
              <span className="text-text-faint">›</span>
              <Crumb label={open.exercise} current />
            </>
          ) : null}
        </div>
      ) : null}

      {!region ? (
        <ul className="space-y-1">
          {regions.map((r) => {
            const sets = setsIn(r.groups);
            if (sets === 0) return null;
            return (
              <Row
                key={r.slug}
                label={r.name}
                hue={mgColour(r.groups[0])}
                aside={`${sets} set${sets === 1 ? "" : "s"}`}
                onClick={() => setRegion(r.slug)}
              />
            );
          })}
          {loose.length > 0 ? (
            <Row
              label="Not in a region"
              hue="var(--border)"
              aside={`${loose.reduce((t, d) => t + d.sets, 0)} sets`}
              onClick={() => {
                setRegion(LOOSE);
                setGroup(LOOSE);
              }}
            />
          ) : null}
        </ul>
      ) : null}

      {region && !group ? (
        <ul className="space-y-1">
          {groupsWorked.map((slug) => {
            const sets = setsIn([slug]);
            return (
              <Row
                key={slug}
                label={groupName.get(slug) ?? slug}
                hue={mgColour(slug)}
                aside={`${sets} set${sets === 1 ? "" : "s"}`}
                onClick={() => setGroup(slug)}
              />
            );
          })}
        </ul>
      ) : null}

      {group && !open ? (
        <ul className="space-y-1">
          {(group === LOOSE ? loose : exercises).map((d) => (
            <Row
              key={d.exerciseId}
              label={d.exercise}
              hue={mgColour(d.group)}
              aside={`${d.sets} set${d.sets === 1 ? "" : "s"} · ${d.setups.length} setup${
                d.setups.length === 1 ? "" : "s"
              }`}
              onClick={() => setExercise(d.exerciseId)}
            />
          ))}
        </ul>
      ) : null}

      {open ? <ExerciseView detail={open} /> : null}
    </div>
  );
}

function ExerciseView({ detail }: { detail: ExerciseDetail }) {
  const hue = mgColour(detail.group);
  return (
    <div className="space-y-3">
      {detail.setups.map((setup, i) => (
        <SetupView key={i} setup={setup} hue={hue} />
      ))}
      {detail.notes.length > 0 ? <SubjectNotes notes={detail.notes} hue={hue} /> : null}

      <p className="text-[11px] leading-snug text-text-dim">
        Each machine is kept separate and never added together: the same number of kilos is a
        different resistance on a cable and on a plate-loaded machine, so pooling them would
        turn a change of equipment into progress. Sessions marked reconstructed were recovered
        from a written record rather than logged as they happened; they are shown because they
        are what you did, and kept out of every comparison because they are not how you
        recorded it.
      </p>
    </div>
  );
}

function SetupView({ setup, hue }: { setup: Setup; hue: string }) {
  const where = [setup.machine, setup.gym].filter(Boolean).join(" · ");
  const matched = matchedLoads(setup.entries);
  // Counted in sets, not rows, so it reads against the "5 sets" beside it.
  const reconstructed = setup.entries
    .filter((e) => !e.logged)
    .reduce((total, e) => total + e.setsCount, 0);

  return (
    <div
      className="rounded-[var(--radius)] border px-3 py-2"
      style={{ borderColor: `color-mix(in oklab, ${hue} 35%, var(--border))` }}
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold">
          {where || <span className="text-text-dim">Machine not recorded</span>}
        </span>
        <span className="shrink-0 text-[10px] text-text-faint">
          {setup.sets} set{setup.sets === 1 ? "" : "s"}
          {reconstructed > 0 ? ` · ${reconstructed} reconstructed` : ""}
        </span>
      </div>

      {matched.length > 0 ? (
        <div className="mb-2 space-y-1.5">
          {matched.map((m) => (
            <div
              key={m.load}
              className="rounded-[var(--radius)] px-2 py-1.5"
              style={{ background: `color-mix(in oklab, ${hue} 7%, var(--surface-2))` }}
            >
              <div className="text-[10px] uppercase tracking-wide text-text-dim">
                At {m.load} kg
              </div>
              <div className="tnum text-sm">
                {describe(m.first)} <span className="text-text-faint">{shortDate(m.first.date)}</span>
                {"  →  "}
                {describe(m.last)} <span className="text-text-faint">{shortDate(m.last.date)}</span>
              </div>
            </div>
          ))}
          <p className="text-[10px] leading-snug text-text-faint">
            The same weight on the same machine, first and most recent. A comparison, not a
            verdict: where you placed it in the session, how you slept and what came before it
            are not in these numbers.
          </p>
        </div>
      ) : null}

      <ul className="space-y-0.5">
        {setup.entries.map((e, i) => (
          <li key={i} className="tnum flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-text-dim">{shortDate(e.date)}</span>
            <span className="flex-1 text-right">
              {describe(e)}
              {e.isDrop ? <span className="ml-1 text-text-faint">drop</span> : null}
              {e.logged ? null : (
                <span className="ml-1 text-text-faint">reconstructed</span>
              )}
              {e.side !== "both" ? <span className="ml-1 text-text-faint">{e.side}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What you wrote about this, beside the numbers it explains.
 *
 * The reason for anchoring a note at all: written once in the gym, read back
 * where the loads are. It is a report and never a measurement — nothing here
 * reaches the set count above it or the comparison beside it.
 */
export function SubjectNotes({
  notes,
  hue,
}: {
  notes: { date: string | null; category: string; content: string }[];
  hue: string;
}) {
  return (
    <div
      className="rounded-[var(--radius)] border-l-2 pl-3"
      style={{ borderColor: `color-mix(in oklab, ${hue} 55%, transparent)` }}
    >
      <div className="text-[10px] uppercase tracking-wide text-text-dim">
        What you wrote
      </div>
      <ul className="mt-1 space-y-1.5">
        {notes.map((n, i) => (
          <li key={i} className="text-[12px] leading-snug">
            <span className="tnum text-text-faint">
              {n.date ? shortDate(n.date) : "undated"}
            </span>{" "}
            <span className="whitespace-pre-wrap">{n.content}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "45 kg × 6 × 3 · RIR 2".
 *
 * What was recorded reads first and what was not is named at the end, so a
 * missing load does not sit in the middle of the arithmetic — "load not
 * recorded × 10 × 3" parses as a quantity for a moment before it parses as
 * an absence. Nothing missing is filled in with a zero.
 */
function describe(e: SetEntry): string {
  const missing: string[] = [];
  const sets = e.setsCount > 1 ? ` × ${e.setsCount}` : "";
  let head: string;

  if (e.load != null && e.reps != null) {
    head = `${e.load} kg × ${e.reps}${sets}`;
  } else if (e.load != null) {
    head = `${e.load} kg${sets}`;
    missing.push("reps not recorded");
  } else if (e.reps != null) {
    head = `${e.reps} reps${sets}`;
    missing.push("load not recorded");
  } else {
    head = `${e.setsCount} set${e.setsCount === 1 ? "" : "s"}`;
    missing.push("load and reps not recorded");
  }

  const rir = e.rir == null ? "" : ` · RIR ${e.rir}`;
  return `${head}${rir}${missing.length > 0 ? ` · ${missing.join(", ")}` : ""}`;
}

/**
 * Loads this setup has been worked at more than once.
 *
 * Drops are excluded: a drop set's load follows the set before it rather than
 * being chosen, so matching on it compares two different intentions. So is
 * anything reconstructed, which is a reading of the record rather than a
 * record of the session. Only
 * loads with a first and a most recent session are returned, and only where
 * those are different sessions — one day at a weight is not a comparison.
 */
function matchedLoads(entries: SetEntry[]) {
  const byLoad = new Map<number, SetEntry[]>();
  for (const e of entries) {
    // Reconstruction never enters a comparison. A load worked out from a
    // chat message in August and one you logged in October are the same
    // number and not the same claim, and putting an arrow between them
    // would present a reading of the record as a change in the athlete.
    if (!e.logged || e.isDrop || e.load == null) continue;
    byLoad.set(e.load, [...(byLoad.get(e.load) ?? []), e]);
  }

  return [...byLoad.entries()]
    .map(([load, list]) => {
      const dates = [...new Set(list.map((e) => e.date))];
      if (dates.length < 2) return null;
      // `entries` arrives newest first.
      return { load, last: list[0], first: list[list.length - 1] };
    })
    .filter((m): m is { load: number; last: SetEntry; first: SetEntry } => m !== null)
    .sort((a, b) => b.load - a.load)
    .slice(0, 3);
}

function Row({
  label,
  aside,
  hue,
  onClick,
}: {
  label: string;
  aside: string;
  hue: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-[var(--radius)] border border-border px-3 text-left text-sm"
      >
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: hue }} aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        <span className="shrink-0 text-[10px] text-text-dim">{aside}</span>
        <span className="shrink-0 text-text-faint" aria-hidden>
          ›
        </span>
      </button>
    </li>
  );
}

function Crumb({
  label,
  current,
  onClick,
}: {
  label: string;
  current?: boolean;
  onClick?: () => void;
}) {
  if (current || !onClick) {
    return <span className="font-semibold">{label}</span>;
  }
  return (
    <button type="button" onClick={onClick} className="text-text-dim underline underline-offset-2">
      {label}
    </button>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Spelled out rather than left to toLocaleString, which abbreviates
 *  September differently under Node and in Chrome and fails hydration. */
function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? m}`;
}
