import type { DailyProgressData } from "./dailyProgress";
import type { Exercise, Gym, HypertrophySet, MuscleGroup, MuscleRegion } from "./types";

export type OutcomeTone = "all" | "partial" | "none" | "unknown";

/** Colour an observation, never infer a trend or turn an unjudged attempt into a failure. */
export function outcomeTone(successes: number | null, attempts: number | null, incomplete = false): OutcomeTone {
  if (incomplete || successes == null || attempts == null || attempts <= 0 || successes < 0 || successes > attempts) return "unknown";
  return successes === attempts ? "all" : successes === 0 ? "none" : "partial";
}

export const OUTCOME_MARKS: Record<OutcomeTone, string> = { all: "✓", partial: "◐", none: "×", unknown: "?" };

export function trainingDose(sets: HypertrophySet[], exercises: Exercise[], groups: MuscleGroup[], regions: MuscleRegion[]) {
  const count = sets.reduce((n, s) => n + s.sets_count, 0);
  const byRegion = new Map<string, number>();
  for (const set of sets) {
    const exercise = exercises.find(e => e.id === set.exercise_id);
    const group = groups.find(g => g.id === exercise?.muscle_group_id);
    const region = regions.find(r => group && r.groups.includes(group.slug));
    const name = region?.name ?? group?.name ?? "Emphasis unrecorded";
    byRegion.set(name, (byRegion.get(name) ?? 0) + set.sets_count);
  }
  const ranked = [...byRegion].sort((a, b) => b[1] - a[1]);
  return {
    count,
    label: ranked.length === 0 ? "No sets recorded" : ranked[0][1] > count / 2 ? ranked[0][0] : "Mixed",
    detail: ranked.map(([name, n]) => `${name}: ${n} sets`).join(" · "),
  };
}

export interface ExerciseSetup {
  key: string;
  label: string;
  identified: boolean;
  byDate: Map<string, HypertrophySet[]>;
}

/** Side, equipment and exercise order are part of a comparison, not just its label. */
export function exerciseSetups(days: DailyProgressData["days"], exercises: Exercise[], gyms: Gym[]): ExerciseSetup[] {
  const setups = new Map<string, ExerciseSetup>();
  for (const day of days) for (const set of day.sets) {
    const session = day.sessions.find(s => s.id === set.session_id);
    const gym = session?.gym_id != null ? gyms.find(g => g.id === session.gym_id)?.name ?? `Gym ${session.gym_id}` : session?.gym_custom_label;
    const machine = set.machine_label?.trim() || null;
    const key = JSON.stringify([set.exercise_id, session?.gym_id, session?.gym_custom_label, machine?.toLowerCase(), set.side, set.order_vs_snatch]);
    const order = set.order_vs_snatch === "before_snatch" ? "before snatch" : set.order_vs_snatch === "after_snatch" ? "after snatch" : set.order_vs_snatch === "standalone" ? "standalone" : "order unrecorded";
    const setup = setups.get(key) ?? {
      key,
      label: `${exercises.find(e => e.id === set.exercise_id)?.name ?? `Exercise ${set.exercise_id}`} · ${gym ?? "gym unrecorded"} · ${machine ?? "equipment unrecorded"} · ${set.side} · ${order}`,
      identified: Boolean(gym && machine),
      byDate: new Map<string, HypertrophySet[]>(),
    };
    setup.byDate.set(day.date, [...(setup.byDate.get(day.date) ?? []), set]);
    setups.set(key, setup);
  }
  return [...setups.values()].sort((a, b) => a.label.localeCompare(b.label, "en-GB"));
}

export function matchedReps(setup: ExerciseSetup | undefined, load: number | null) {
  if (!setup?.identified || load == null) return [];
  return [...setup.byDate].flatMap(([date, sets]) => sets.filter(s => !s.is_drop && s.load_kg === load && s.reps != null).map(s => ({ date, reps: s.reps!, sets: s.sets_count, rir: s.rir })));
}

/** A numeric difference between single ratings, not a verdict that a skill improved. */
export function qualityChange(current: (number | null)[], previous: (number | null)[]): number | null {
  if (current.length !== 1 || previous.length !== 1 || current[0] == null || previous[0] == null) return null;
  return current[0] - previous[0];
}
