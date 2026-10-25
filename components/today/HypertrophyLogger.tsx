"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { Pill, SectionTitle } from "@/components/ui";
import type {
  Exercise,
  HypertrophySet,
  LastExerciseSetting,
  MuscleGroup,
} from "@/lib/types";

/**
 * Set logging that opens with the answer already in it.
 *
 * The load and reps are prefilled from the last time this exercise was done
 * at this gym — machine identity is (gym, exercise), so Ealing's pendulum
 * squat does not offer Greenford's number. Repeating a set is one tap, which
 * is what most sets are.
 */

type Props = {
  sessionId: string;
  sessionBlockId: string | null;
  gymId: number | null;
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
  recentExerciseIds: number[];
  lastSettings: LastExerciseSetting[];
  initialSets: HypertrophySet[];
  canWrite: boolean;
};

export function HypertrophyLogger({
  sessionId,
  sessionBlockId,
  gymId,
  exercises,
  muscleGroups,
  recentExerciseIds,
  lastSettings,
  initialSets,
  canWrite,
}: Props) {
  const router = useRouter();
  const [sets, setSets] = useState<HypertrophySet[]>(initialSets);
  const [exerciseId, setExerciseId] = useState<number | null>(null);
  const [load, setLoad] = useState<string>("");
  const [reps, setReps] = useState<string>("");
  const [showAll, setShowAll] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const exercise = exerciseId === null ? null : (byId.get(exerciseId) ?? null);

  /** Same gym first; the exercise anywhere is a weaker but useful fallback. */
  function lastFor(id: number): { setting: LastExerciseSetting; sameGym: boolean } | null {
    const sameGym = lastSettings.find((s) => s.exercise_id === id && s.gym_id === gymId);
    if (sameGym) return { setting: sameGym, sameGym: true };
    const anywhere = lastSettings.find((s) => s.exercise_id === id);
    return anywhere ? { setting: anywhere, sameGym: false } : null;
  }

  const prefill = exerciseId === null ? null : lastFor(exerciseId);

  function choose(id: number) {
    setExerciseId(id);
    // You found what you came for; the other 25 are just distance to scroll.
    setShowAll(false);
    const previous = lastFor(id);
    setLoad(previous?.setting.load_kg != null ? String(Number(previous.setting.load_kg)) : "");
    setReps(previous?.setting.reps != null ? String(previous.setting.reps) : "");
  }

  function run(task: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function addSet(from?: HypertrophySet) {
    const payloadExercise = from?.exercise_id ?? exerciseId;
    if (payloadExercise === null) return;
    run(async () => {
      const result = await write<{ set: HypertrophySet }>({
        action: "log_hypertrophy_set",
        session_id: sessionId,
        session_block_id: sessionBlockId,
        exercise_id: payloadExercise,
        load_kg: from ? from.load_kg : load === "" ? null : Number(load),
        reps: from ? from.reps : reps === "" ? null : Number(reps),
        side: from?.side ?? "both",
      });
      setSets((prev) => [...prev, result.set]);
    });
  }

  function remove(id: string) {
    run(async () => {
      await write({ action: "delete_hypertrophy_set", set_id: id });
      setSets((prev) => prev.filter((s) => s.id !== id));
    });
  }

  const recent = recentExerciseIds.map((id) => byId.get(id)).filter((e): e is Exercise => !!e);
  const volume = sets.reduce<number>((total, s) => total + Number(s.volume_load_kg ?? 0), 0);

  return (
    <div className="space-y-3">
      <SectionTitle
        aside={
          sets.length > 0 ? (
            <span className="tnum">
              {sets.length} set{sets.length === 1 ? "" : "s"} ·{" "}
              {Math.round(volume).toLocaleString("en-GB")} kg
            </span>
          ) : null
        }
      >
        Hypertrophy
      </SectionTitle>

      {/* What you actually use, not 27 rows in alphabetical order. */}
      <div className="flex flex-wrap gap-1.5">
        {(showAll ? exercises : recent).map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => choose(e.id)}
            aria-pressed={e.id === exerciseId}
            className="min-h-[36px] rounded-full border px-3 text-xs font-semibold"
            style={{
              borderColor: e.id === exerciseId ? "var(--accent)" : "var(--border)",
              color: e.id === exerciseId ? "var(--accent)" : "var(--text-dim)",
            }}
          >
            {e.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="min-h-[36px] rounded-full border border-dashed border-border px-3 text-xs font-semibold text-text-faint"
        >
          {showAll ? "Recent only" : `All ${exercises.length}`}
        </button>
      </div>

      {exercise ? (
        <div
          className="rounded-[var(--radius)] border p-3"
          style={{ borderColor: "var(--accent)", background: "var(--surface-2)" }}
        >
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-semibold">{exercise.name}</div>
            <div className="text-[10px] text-text-faint">
              {muscleGroups.find((g) => g.id === exercise.muscle_group_id)?.name ?? ""}
            </div>
          </div>

          {prefill ? (
            <p className="mt-1 text-[11px] text-text-faint">
              Last time{prefill.sameGym ? " here" : " (different gym)"}:{" "}
              {prefill.setting.load_kg != null ? `${Number(prefill.setting.load_kg)} kg` : "—"}
              {prefill.setting.reps != null ? ` × ${prefill.setting.reps}` : ""} on{" "}
              {prefill.setting.last_used_on}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-text-faint">No previous record for this one.</p>
          )}

          <div className="mt-3 flex items-end gap-2">
            <Field label="Load" unit="kg" value={load} onChange={setLoad} step="0.5" />
            <Field label="Reps" value={reps} onChange={setReps} step="1" />
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() => addSet()}
              className="min-h-[48px] flex-1 rounded-[var(--radius)] text-sm font-bold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              Add set
            </button>
          </div>
          {exercise.is_unilateral ? (
            <p className="mt-2 text-[11px] text-text-faint">
              Unilateral — log each side as its own set if they differ.
            </p>
          ) : null}
        </div>
      ) : null}

      {sets.length > 0 ? (
        <ul className="space-y-1.5">
          {sets.map((set) => (
            <li
              key={set.id}
              className="flex items-center gap-2 rounded-[var(--radius)] border border-border px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {byId.get(set.exercise_id)?.name ?? "Exercise"}
                {set.is_drop ? <Pill tone="caught">drop</Pill> : null}
              </span>
              <span className="tnum text-sm text-text-dim">
                {set.load_kg != null ? `${Number(set.load_kg)} kg` : "—"}
                {set.reps != null ? ` × ${set.reps}` : ""}
              </span>
              <button
                type="button"
                disabled={!canWrite || busy}
                onClick={() => addSet(set)}
                aria-label="Repeat this set"
                className="min-h-[32px] rounded border border-border px-2 text-xs font-semibold text-text-dim disabled:opacity-40"
              >
                +1
              </button>
              <button
                type="button"
                disabled={!canWrite || busy}
                onClick={() => remove(set.id)}
                aria-label="Delete this set"
                className="min-h-[32px] px-1 text-sm text-text-faint disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      <p className="text-[11px] leading-snug text-text-faint">
        Volume load is a training metric, not a measurement of muscle growth. Loads are not
        comparable across gyms, because the machines differ.
      </p>
    </div>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  step,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (value: string) => void;
  step: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-text-faint">
        {label}
        {unit ? ` (${unit})` : ""}
      </div>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={value}
        placeholder="—"
        onChange={(event) => onChange(event.target.value)}
        className="tnum min-h-[48px] w-20 rounded-[var(--radius)] border border-border bg-surface px-2 text-center text-base"
        aria-label={label}
      />
    </div>
  );
}
