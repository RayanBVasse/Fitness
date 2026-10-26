"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { Chip, SectionTitle, mgColour, wsColour } from "@/components/ui";
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
 * squat does not offer Greenford's number.
 *
 * Every set is editable, before and after it is saved. The `+` on a block
 * opens the next set already filled in with the last one's numbers: confirm it
 * unchanged, or change the load or the reps first. Most sets repeat, but the
 * ones that matter are the ones that do not, and a logger that can only repeat
 * quietly pushes you towards recording a number you did not lift.
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
  /** Which tile is open for editing: an existing set, or a new one on a block. */
  const [editing, setEditing] = useState<{ setId: string | null; exerciseId: number } | null>(
    null,
  );
  const [editLoad, setEditLoad] = useState("");
  const [editReps, setEditReps] = useState("");
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const exercise = exerciseId === null ? null : (byId.get(exerciseId) ?? null);
  const slugOf = (id: number | null | undefined) =>
    muscleGroups.find((g) => g.id === id)?.slug ?? null;
  /** The colour of whatever is being logged right now. */
  const activeColour = mgColour(slugOf(exercise?.muscle_group_id));

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

  function addSet() {
    if (exerciseId === null) return;
    run(async () => {
      const result = await write<{ set: HypertrophySet }>({
        action: "log_hypertrophy_set",
        session_id: sessionId,
        session_block_id: sessionBlockId,
        exercise_id: exerciseId,
        load_kg: load === "" ? null : Number(load),
        reps: reps === "" ? null : Number(reps),
        side: "both",
      });
      setSets((prev) => [...prev, result.set]);
    });
  }

  /** The next set, opened at the last one's numbers rather than assuming them. */
  function openNext(previous: HypertrophySet) {
    setError(null);
    setEditing({ setId: null, exerciseId: previous.exercise_id });
    setEditLoad(previous.load_kg != null ? String(Number(previous.load_kg)) : "");
    setEditReps(previous.reps != null ? String(previous.reps) : "");
  }

  function openEdit(set: HypertrophySet) {
    setError(null);
    setEditing({ setId: set.id, exerciseId: set.exercise_id });
    setEditLoad(set.load_kg != null ? String(Number(set.load_kg)) : "");
    setEditReps(set.reps != null ? String(set.reps) : "");
  }

  function commitEdit() {
    const current = editing;
    if (!current) return;
    const nextLoad = editLoad.trim() === "" ? null : Number(editLoad);
    const nextReps = editReps.trim() === "" ? null : Number(editReps);
    if (
      (nextLoad !== null && !Number.isFinite(nextLoad)) ||
      (nextReps !== null && !Number.isFinite(nextReps))
    ) {
      setError("Load and reps have to be numbers, or left empty.");
      return;
    }
    run(async () => {
      if (current.setId) {
        const result = await write<{ set: HypertrophySet }>({
          action: "update_hypertrophy_set",
          set_id: current.setId,
          load_kg: nextLoad,
          reps: nextReps,
        });
        setSets((prev) => prev.map((s) => (s.id === current.setId ? result.set : s)));
      } else {
        const result = await write<{ set: HypertrophySet }>({
          action: "log_hypertrophy_set",
          session_id: sessionId,
          session_block_id: sessionBlockId,
          exercise_id: current.exerciseId,
          load_kg: nextLoad,
          reps: nextReps,
          side: "both",
        });
        setSets((prev) => [...prev, result.set]);
      }
      setEditing(null);
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

  // One block per exercise, in the order each was first used. Returning to a
  // movement later in the session joins its block rather than opening a second
  // one, which is how it reads on paper.
  const groups: {
    key: string;
    name: string;
    exerciseId: number;
    muscleGroupId: number | null;
    sets: HypertrophySet[];
    volume: number;
  }[] = [];
  for (const set of sets) {
    let group = groups.find((g) => g.sets[0].exercise_id === set.exercise_id);
    if (!group) {
      const exercise = byId.get(set.exercise_id);
      group = {
        key: `e${set.exercise_id}`,
        name: exercise?.name ?? "Exercise",
        exerciseId: set.exercise_id,
        muscleGroupId: exercise?.muscle_group_id ?? null,
        sets: [],
        volume: 0,
      };
      groups.push(group);
    }
    group.sets.push(set);
    group.volume += Number(set.volume_load_kg ?? 0);
  }

  /**
   * The muscle's own colour, not a slot in a rotation. Two leg movements now
   * read as the same family wherever they appear, and adding an exercise
   * cannot shuffle the colours of the ones already logged.
   */
  function groupColour(muscleGroupId: number | null): string {
    return mgColour(slugOf(muscleGroupId));
  }

  return (
    <div className="space-y-3">
      <SectionTitle
        tone={wsColour("hypertrophy")}
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
          <Chip
            key={e.id}
            on={e.id === exerciseId}
            hue={mgColour(slugOf(e.muscle_group_id))}
            onClick={() => choose(e.id)}
          >
            {e.name}
          </Chip>
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
          style={{ borderColor: activeColour, background: "var(--surface-2)" }}
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

      {groups.length > 0 ? (
        <ul className="space-y-2">
          {groups.map((group) => {
            const colour = groupColour(group.muscleGroupId);
            return (
              <li
                key={group.key}
                className="overflow-hidden rounded-[var(--radius)] border border-border"
                // A stripe, not a fill: it groups the rows without competing
                // with the numbers, which are the thing being read.
                style={{ borderLeft: `4px solid ${colour}` }}
              >
                <div
                  className="flex items-baseline justify-between gap-2 px-3 py-1.5"
                  style={{ background: `color-mix(in oklab, ${colour} 12%, var(--surface))` }}
                >
                  <span className="truncate text-sm font-semibold">{group.name}</span>
                  <span className="tnum shrink-0 text-[11px] text-text-dim">
                    {group.sets.length} set{group.sets.length === 1 ? "" : "s"} ·{" "}
                    {Math.round(group.volume).toLocaleString("en-GB")} kg
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1 p-2">
                  {group.sets.map((set) =>
                    editing?.setId === set.id ? (
                      <SetEditor
                        key={set.id}
                        hue={colour}
                        label={group.name}
                        load={editLoad}
                        reps={editReps}
                        disabled={!canWrite || busy}
                        onLoad={setEditLoad}
                        onReps={setEditReps}
                        onCommit={commitEdit}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <div key={set.id} className="relative">
                        {/* The tile is the edit control. A set logged at the
                            wrong weight should be correctable where you read
                            it, not deleted and retyped. */}
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={() => openEdit(set)}
                          aria-label={`Edit this set of ${group.name}`}
                          className="rounded-md border border-border px-2 py-1 text-center disabled:opacity-40"
                          style={{ background: "var(--surface-2)" }}
                        >
                          <div className="tnum text-sm font-semibold leading-tight">
                            {set.load_kg != null ? Number(set.load_kg) : "—"}
                            <span className="text-[10px] font-normal text-text-faint"> kg</span>
                          </div>
                          <div className="tnum text-[10px] leading-tight text-text-dim">
                            × {set.reps ?? "—"}
                            {set.is_drop ? " drop" : ""}
                          </div>
                        </button>
                        <button
                          type="button"
                          disabled={!canWrite || busy}
                          onClick={() => remove(set.id)}
                          aria-label={`Delete this set of ${group.name}`}
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border text-[9px] leading-none text-text-faint disabled:opacity-40"
                          style={{ background: "var(--surface)" }}
                        >
                          ×
                        </button>
                      </div>
                    ),
                  )}

                  {/* The next set, opened at the last one's numbers. Confirm it
                      unchanged, or change the load or the reps first. */}
                  {editing?.setId === null && editing.exerciseId === group.exerciseId ? (
                    <SetEditor
                      hue={colour}
                      label={group.name}
                      load={editLoad}
                      reps={editReps}
                      disabled={!canWrite || busy}
                      onLoad={setEditLoad}
                      onReps={setEditReps}
                      onCommit={commitEdit}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={!canWrite || busy}
                      onClick={() => openNext(group.sets[group.sets.length - 1])}
                      aria-label={`Add another set of ${group.name}`}
                      className="min-h-[44px] min-w-[44px] rounded-md border px-2 text-sm font-bold disabled:opacity-40"
                      style={{
                        borderColor: colour,
                        color: colour,
                        background: `color-mix(in oklab, ${colour} 10%, transparent)`,
                      }}
                    >
                      +
                    </button>
                  )}
                </div>
              </li>
            );
          })}
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

/**
 * The inline set editor: two numbers, confirm, cancel. Enter commits and
 * Escape backs out, because this gets used mid-set with one hand.
 */
function SetEditor({
  label,
  hue,
  load,
  reps,
  disabled,
  onLoad,
  onReps,
  onCommit,
  onCancel,
}: {
  label: string;
  hue: string;
  load: string;
  reps: string;
  disabled: boolean;
  onLoad: (value: string) => void;
  onReps: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  function keys(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  const field =
    "tnum h-9 rounded border border-border bg-surface px-1 text-center text-sm disabled:opacity-40";

  return (
    <div
      className="flex items-center gap-1 rounded-md border px-1.5 py-1"
      style={{ borderColor: hue, background: "var(--surface-2)" }}
    >
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        step="0.5"
        value={load}
        disabled={disabled}
        placeholder="kg"
        aria-label={`Load in kg, ${label}`}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onLoad(event.target.value)}
        onKeyDown={keys}
        className={`${field} w-14`}
      />
      <span className="text-[10px] text-text-faint">×</span>
      <input
        type="number"
        inputMode="numeric"
        step="1"
        value={reps}
        disabled={disabled}
        placeholder="reps"
        aria-label={`Reps, ${label}`}
        onFocus={(event) => event.target.select()}
        onChange={(event) => onReps(event.target.value)}
        onKeyDown={keys}
        className={`${field} w-12`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={onCommit}
        aria-label={`Save this set of ${label}`}
        className="flex h-9 w-9 items-center justify-center rounded text-sm font-bold disabled:opacity-40"
        style={{ background: "var(--accent)", color: "var(--accent-text)" }}
      >
        ✓
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onCancel}
        aria-label="Cancel"
        className="flex h-9 w-7 items-center justify-center rounded border border-border text-xs text-text-faint disabled:opacity-40"
      >
        ✕
      </button>
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
