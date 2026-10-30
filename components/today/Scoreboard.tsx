"use client";

import { MuscleBar, StickyNote, TilePill, WorkstreamTile, type TileStat } from "@/components/design";
import { MIN_ATTEMPTS_FOR_RATE } from "@/components/ui";
import type {
  CalisthenicsAttempt,
  CalisthenicsEntry,
  Exercise,
  HypertrophySet,
  MuscleGroup,
  SkillVariation,
  SnatchAttempt,
  SnatchBlock,
  SnatchObjective,
  SnatchVariation,
  Workstream,
} from "@/lib/types";

/**
 * The day at a glance: the objective, then one tile per workstream.
 *
 * Every figure is counted from the rows already on screen, so the band
 * cannot disagree with the logger beneath it. Nothing unrecorded is shown as
 * a zero — a tile with no rating shows a dash and says "not rated", because
 * a nought here would read as a bad session rather than as an unanswered
 * question.
 *
 * Tapping a tile opens that logger. The tile and the tab hold one piece of
 * state between them, so they cannot drift apart.
 */

type Props = {
  objective: SnatchObjective | null;
  /** Logged stand rate at the objective's load, all time. Null if none. */
  objectiveRate: { stood: number; attempts: number } | null;
  snatchBlocks: SnatchBlock[];
  snatchAttempts: SnatchAttempt[];
  hypertrophySets: HypertrophySet[];
  calisthenicsEntries: CalisthenicsEntry[];
  calisthenicsAttempts: CalisthenicsAttempt[];
  variations: SnatchVariation[];
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
  skillVariations: SkillVariation[];
  active: Workstream | null;
  onSelect: (workstream: Workstream) => void;
};

const num = (v: number) => (v >= 1000 ? v.toLocaleString("en-GB") : String(v));

export function Scoreboard({
  objective,
  objectiveRate,
  snatchBlocks,
  snatchAttempts,
  hypertrophySets,
  calisthenicsEntries,
  calisthenicsAttempts,
  variations,
  exercises,
  muscleGroups,
  skillVariations,
  active,
  onSelect,
}: Props) {
  /* ---- snatch ---------------------------------------------------------- */
  const fullIds = new Set(variations.filter((v) => v.counts_as_full_lift).map((v) => v.id));
  const fullBlocks = snatchBlocks.filter((b) => fullIds.has(b.variation_id) && !b.is_warmup);

  const perLoad = new Map<number, { attempts: number; stood: number }>();
  let snatchAttemptTotal = 0;
  let snatchStoodTotal = 0;
  let heaviest: number | null = null;

  for (const b of fullBlocks) {
    const rows = snatchAttempts.filter((a) => a.block_id === b.id);
    const attempts = rows.length > 0 ? rows.length : (b.attempts ?? 0);
    const stood =
      rows.length > 0
        ? rows.filter((a) => a.outcome === "stood").length
        : (b.full_stand_successes ?? 0);
    const load = Number(b.weight_kg ?? 0);
    if (load > 0) {
      const acc = perLoad.get(load) ?? { attempts: 0, stood: 0 };
      perLoad.set(load, { attempts: acc.attempts + attempts, stood: acc.stood + stood });
      if (stood > 0 && (heaviest === null || load > heaviest)) heaviest = load;
    }
    snatchAttemptTotal += attempts;
    snatchStoodTotal += stood;
  }

  const snatchStats: TileStat[] = [
    {
      label: "Attempts",
      value: snatchAttemptTotal > 0 ? String(snatchAttemptTotal) : null,
      sub: `${fullBlocks.length} block${fullBlocks.length === 1 ? "" : "s"}`,
    },
    {
      label: "Stood",
      value: snatchAttemptTotal > 0 ? String(snatchStoodTotal) : null,
      sub:
        snatchAttemptTotal > 0
          ? `${Math.round((100 * snatchStoodTotal) / snatchAttemptTotal)}%`
          : null,
    },
    // Heaviest STOOD, not heaviest attempted: a weight you failed at is not
    // a weight you lifted.
    { label: "Heaviest", value: heaviest === null ? null : String(heaviest), sub: "kg stood" },
  ];

  /* ---- hypertrophy ----------------------------------------------------- */
  const working = hypertrophySets.filter((s) => !s.is_drop);
  const setCount = working.reduce((t, s) => t + s.sets_count, 0);
  const volume = hypertrophySets.reduce((t, s) => t + Number(s.volume_load_kg ?? 0), 0);
  const rirValues = working.map((s) => s.rir).filter((r): r is number => r != null);

  const groupOf = new Map(exercises.map((e) => [e.id, e.muscle_group_id]));
  const groupMeta = new Map(muscleGroups.map((g) => [g.id, g]));
  const perMuscle = new Map<string, { slug: string; name: string; sets: number }>();
  for (const s of working) {
    const g = groupMeta.get(groupOf.get(s.exercise_id) ?? -1);
    if (!g) continue;
    const acc = perMuscle.get(g.slug) ?? { slug: g.slug, name: g.name, sets: 0 };
    acc.sets += s.sets_count;
    perMuscle.set(g.slug, acc);
  }

  const hypertrophyStats: TileStat[] = [
    { label: "Sets", value: setCount > 0 ? String(setCount) : null, sub: null },
    { label: "Volume", value: volume > 0 ? num(Math.round(volume)) : null, sub: "kg" },
    {
      label: "RIR",
      value:
        rirValues.length > 0
          ? `${Math.min(...rirValues)}–${Math.max(...rirValues)}`
          : null,
      sub: rirValues.length > 0 ? `${rirValues.length} of ${working.length}` : "not rated",
    },
  ];

  /* ---- calisthenics ---------------------------------------------------- */
  let skillAttempts = 0;
  let skillSuccesses = 0;
  const holds: number[] = [];
  const skillNames: string[] = [];
  for (const e of calisthenicsEntries) {
    const rows = calisthenicsAttempts.filter((a) => a.entry_id === e.id);
    skillAttempts += rows.length > 0 ? rows.length : (e.attempts ?? 0);
    skillSuccesses +=
      rows.length > 0
        ? rows.filter((a) => a.succeeded).length
        : (e.successful_attempts ?? 0);
    for (const r of rows) if (r.hold_seconds != null) holds.push(Number(r.hold_seconds));
    if (rows.length === 0 && e.best_hold_seconds != null) holds.push(Number(e.best_hold_seconds));
    const name = skillVariations.find((v) => v.id === e.skill_variation_id)?.name;
    if (name && !skillNames.includes(name)) skillNames.push(name);
  }

  const calisthenicsStats: TileStat[] = [
    { label: "Attempts", value: skillAttempts > 0 ? String(skillAttempts) : null, sub: null },
    {
      label: "Successful",
      value: skillAttempts > 0 ? String(skillSuccesses) : null,
      sub: skillAttempts > 0 ? `${Math.round((100 * skillSuccesses) / skillAttempts)}%` : null,
    },
    {
      label: "Hold",
      value: holds.length > 0 ? String(Math.max(...holds)) : null,
      sub: holds.length > 0 ? "s longest" : "none timed",
    },
  ];

  /* ---- objective ------------------------------------------------------- */
  // The same floor the rest of the app keeps. A rate drawn from two attempts
  // moves fifty points on the next lift, and a progress bar is the last
  // place to put a number that unstable — it is read as how you are doing.
  const attemptsAt = objectiveRate?.attempts ?? 0;
  const rate =
    objectiveRate && attemptsAt >= MIN_ATTEMPTS_FOR_RATE
      ? Math.round((100 * objectiveRate.stood) / attemptsAt)
      : null;
  const target = objective?.primary_target_stand_rate_pct ?? null;

  return (
    <div className="grid grid-cols-1 items-stretch gap-2.5 min-[560px]:grid-cols-2 min-[900px]:grid-cols-[1.15fr_1fr_1fr_1fr]">
      {objective ? (
        <StickyNote label="Objective" className="min-[560px]:col-span-2 min-[900px]:col-span-1">
          {objective.statement}
          {rate !== null && target !== null ? (
            <>
              <div
                className="relative mt-2 h-2 w-full rounded-full"
                style={{ background: "rgb(60 45 0 / .12)" }}
              >
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${Math.min(rate, 100)}%`, background: "var(--ws-snatch)" }}
                />
                {/* Where you are against where you said you would be. */}
                <div
                  className="absolute top-0 h-2 w-[2px]"
                  style={{ left: `${Math.min(target, 100)}%`, background: "var(--note-ink)" }}
                  aria-hidden
                />
              </div>
              <div
                className="tnum mt-1 flex justify-between text-[11px]"
                style={{ color: "var(--note-ink-dim)" }}
              >
                <span>
                  {objective.primary_load_kg} kg · {rate}% now
                </span>
                <span>target {target}%</span>
              </div>
              <div className="mt-0.5 text-[10px]" style={{ color: "var(--note-ink-dim)" }}>
                Lifts you logged, all time. The imported reconstruction is not in it.
              </div>
            </>
          ) : (
            <div className="mt-1 text-[11px]" style={{ color: "var(--note-ink-dim)" }}>
              {attemptsAt === 0
                ? `No logged attempts at ${objective.primary_load_kg} kg yet, so there is no rate.`
                : `${objectiveRate?.stood ?? 0} stood of ${attemptsAt} logged at ` +
                  `${objective.primary_load_kg} kg — too few for a rate.`}
            </div>
          )}
        </StickyNote>
      ) : null}

      <WorkstreamTile
        workstream="snatch"
        title="Snatch"
        stats={snatchStats}
        active={active === "snatch"}
        onSelect={() => onSelect("snatch")}
        footer={[...perLoad.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([load, v]) => (
            <TilePill key={load} workstream="snatch">
              {load} · {v.stood}/{v.attempts}
            </TilePill>
          ))}
      />

      <WorkstreamTile
        workstream="hypertrophy"
        title="Hypertrophy"
        stats={hypertrophyStats}
        active={active === "hypertrophy"}
        onSelect={() => onSelect("hypertrophy")}
        footer={
          perMuscle.size > 0 ? (
            <MuscleBar segments={[...perMuscle.values()].sort((a, b) => b.sets - a.sets)} />
          ) : undefined
        }
      />

      <WorkstreamTile
        workstream="calisthenics"
        title="Calisthenics"
        stats={calisthenicsStats}
        active={active === "calisthenics"}
        onSelect={() => onSelect("calisthenics")}
        footer={skillNames.slice(0, 3).map((name) => (
          <TilePill key={name} workstream="calisthenics">
            {name}
          </TilePill>
        ))}
      />
    </div>
  );
}
