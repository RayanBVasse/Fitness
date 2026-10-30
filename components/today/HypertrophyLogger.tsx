"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { Chip, SectionTitle, mgColour, wsColour } from "@/components/ui";
import { Collapsible } from "@/components/Collapsible";
import type {
  Exercise,
  HypertrophySet,
  LastExerciseSetting,
  MuscleGroup,
  MuscleRegion,
} from "@/lib/types";

/**
 * Set logging that opens with the answer already in it.
 *
 * The load and reps are prefilled from the last time this exercise was done
 * at this gym — machine identity is (gym, exercise), so Ealing's pendulum
 * squat does not offer Greenford's number.
 *
 * You come in for a region, not an exercise: legs, or chest and biceps. The
 * picker opens on that day's region and shows its twelve-to-fifteen machines
 * with what each was last done at, so choosing one is reading rather than
 * remembering. The other fifteen exercises are a tap away and not in the way.
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
  muscleRegions: MuscleRegion[];
  /** The weekday theme's emphasis, used only to open on the likely region. */
  regionHint: string | null;
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
  muscleRegions,
  regionHint,
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
  const [scope, setScope] = useState<string>(() => {
    // Open on the day's region when the weekday theme names one. It is a
    // starting point, never a restriction: every other region is one tap away
    // and nothing is filtered out of "All".
    // The emphasis is prose — "legs", but also "legs and calisthenics" — so
    // a region counts as named if it appears in it, not only if it is the
    // whole of it. Longest first, so "chest & biceps" is not beaten to the
    // match by a region whose name happens to be a word inside it.
    const hint = (regionHint ?? "").toLowerCase();
    const match = [...muscleRegions]
      .sort((a, b) => b.name.length - a.name.length)
      .find(
        (r) =>
          r.slug === hint ||
          r.name.toLowerCase() === hint ||
          hint.includes(r.name.toLowerCase()) ||
          hint.includes(r.slug.replace(/_/g, " ")),
      );
    return match ? match.slug : "recent";
  });
  const [setsToAdd, setSetsToAdd] = useState(1);
  const [machine, setMachine] = useState("");
  /** Which tile is open for editing: an existing set, or a new one on a block. */
  const [editing, setEditing] = useState<{ setId: string | null; exerciseId: number } | null>(
    null,
  );
  const [editLoad, setEditLoad] = useState("");
  const [editReps, setEditReps] = useState("");
  const [editRir, setEditRir] = useState("");
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
    const previous = lastFor(id);
    setLoad(previous?.setting.load_kg != null ? String(Number(previous.setting.load_kg)) : "");
    setReps(previous?.setting.reps != null ? String(previous.setting.reps) : "");
    // Only carried over from the same gym: a machine label from another gym
    // names a machine that is not in front of you.
    setMachine(previous?.sameGym ? (previous.setting.machine_label ?? "") : "");
    setSetsToAdd(1);
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
      // Each set becomes its own row, even when several are logged at once:
      // three sets of six is three things that happened, and the next one may
      // not match. The count is a shortcut for typing, not a data model.
      const result = await write<{ sets: HypertrophySet[] }>({
        action: "log_hypertrophy_set",
        session_id: sessionId,
        session_block_id: sessionBlockId,
        exercise_id: exerciseId,
        machine_label: machine.trim() === "" ? null : machine.trim(),
        load_kg: load === "" ? null : Number(load),
        reps: reps === "" ? null : Number(reps),
        repeat: setsToAdd,
        side: "both",
      });
      setSets((prev) => [...prev, ...result.sets]);
      setSetsToAdd(1);
    });
  }

  /** The next set, opened at the last one's numbers rather than assuming them. */
  function openNext(previous: HypertrophySet) {
    setError(null);
    setEditing({ setId: null, exerciseId: previous.exercise_id });
    setEditLoad(previous.load_kg != null ? String(Number(previous.load_kg)) : "");
    setEditReps(previous.reps != null ? String(previous.reps) : "");
    // Effort is never carried forward. How close the last set was to failure
    // says nothing about this one — that is the whole reason to record it.
    setEditRir("");
  }

  function openEdit(set: HypertrophySet) {
    setError(null);
    setEditing({ setId: set.id, exerciseId: set.exercise_id });
    setEditLoad(set.load_kg != null ? String(Number(set.load_kg)) : "");
    setEditReps(set.reps != null ? String(set.reps) : "");
    setEditRir(set.rir != null ? String(set.rir) : "");
  }

  function commitEdit() {
    const current = editing;
    if (!current) return;
    const nextLoad = editLoad.trim() === "" ? null : Number(editLoad);
    const nextReps = editReps.trim() === "" ? null : Number(editReps);
    const nextRir = editRir.trim() === "" ? null : Number(editRir);
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
          rir: nextRir,
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

  /** What the picker is showing: a region's machines, the recent ones, or all. */
  const region = muscleRegions.find((r) => r.slug === scope) ?? null;
  const visible = region
    ? exercises.filter((e) => {
        const slug = slugOf(e.muscle_group_id);
        return slug !== null && region.groups.includes(slug);
      })
    : scope === "all"
      ? exercises
      : recent;

  /**
   * The last day this region was trained, and what was done on it.
   *
   * Taken from the most recent date any of the region's exercises was used,
   * so a skipped Monday falls through to the Monday before rather than
   * showing nothing. It is a reading of what is recorded, not a plan: these
   * exercises are listed first and nothing is written until you log a set,
   * because a set carried over from another day is a set that did not happen
   * on this one.
   */
  const regionLastDay = region
    ? (visible
        .map((e) => lastFor(e.id)?.setting.last_used_on)
        .filter((d): d is string => Boolean(d))
        .sort()
        .at(-1) ?? null)
    : null;
  const fromLastDay = regionLastDay
    ? visible.filter((e) => lastFor(e.id)?.setting.last_used_on === regionLastDay)
    : [];
  const theRest = visible.filter((e) => !fromLastDay.includes(e));
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

      <Collapsible
        label="Exercise"
        hint={exercise ? exercise.name : undefined}
        startOpen={sets.length === 0}
      >
      {/* Region first. A day is a region, not an exercise. */}
      <div className="flex flex-wrap gap-1.5">
        {muscleRegions.map((region) => (
          <Chip
            key={region.slug}
            on={scope === region.slug}
            hue={mgColour(region.groups[0])}
            onClick={() => setScope(region.slug)}
          >
            {region.name}
          </Chip>
        ))}
        <Chip on={scope === "recent"} onClick={() => setScope("recent")}>
          Recent
        </Chip>
        <Chip on={scope === "all"} onClick={() => setScope("all")}>
          All {exercises.length}
        </Chip>
      </div>

      {/* Each machine with what it was last done at, so picking one is
          reading rather than remembering. */}
      {regionLastDay && fromLastDay.length > 0 ? (
        <p className="text-[11px] text-text-dim">
          Last {region?.name.toLowerCase()} day:{" "}
          <span className="tnum">{regionLastDay}</span> · {fromLastDay.length} exercise
          {fromLastDay.length === 1 ? "" : "s"}, listed first
        </p>
      ) : null}

      {visible.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {[...fromLastDay, ...theRest].map((e) => {
            const colour = mgColour(slugOf(e.muscle_group_id));
            const previous = lastFor(e.id);
            const on = e.id === exerciseId;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => choose(e.id)}
                aria-pressed={on}
                className="min-h-[52px] rounded-[var(--radius)] border px-2 py-1.5 text-left"
                // Every side named explicitly. `borderColor` is itself
                // shorthand for four sides, so pairing it with a left-only
                // value makes React warn and can leave the selected border
                // unrepainted on rerender.
                style={{
                  borderTopColor: on ? colour : "var(--border)",
                  borderRightColor: on ? colour : "var(--border)",
                  borderBottomColor: on ? colour : "var(--border)",
                  borderLeftColor: colour,
                  borderLeftWidth: 4,
                  background: on
                    ? `color-mix(in oklab, ${colour} 10%, transparent)`
                    : "transparent",
                }}
              >
                <span className="block truncate text-xs font-semibold leading-tight">
                  {e.name}
                </span>
                <span className="tnum block truncate text-[10px] leading-tight text-text-dim">
                  {previous
                    ? `${previous.setting.load_kg != null ? `${Number(previous.setting.load_kg)} kg` : "—"}` +
                      `${previous.setting.reps != null ? ` × ${previous.setting.reps}` : ""}` +
                      `${previous.sameGym ? "" : " (elsewhere)"}`
                    : "not done here yet"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-text-dim">
          No exercises in this region yet. Settings lists which muscle groups it covers.
        </p>
      )}
      </Collapsible>

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

          {/* Which of two identical machines. Optional, and remembered per
              gym: machine identity is (gym, exercise), and this is what
              separates the two leg presses in one room. */}
          <input
            type="text"
            value={machine}
            disabled={!canWrite || busy}
            placeholder="Machine or station (optional)"
            onChange={(event) => setMachine(event.target.value)}
            aria-label="Machine or station"
            className="mt-3 h-9 w-full rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
          />

          <div className="mt-2 flex items-end gap-2">
            <Field label="Load" unit="kg" value={load} onChange={setLoad} step="0.5" />
            <Field label="Reps" value={reps} onChange={setReps} step="1" />
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-dim">Sets</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSetsToAdd((n) => Math.max(1, n - 1))}
                  aria-label="One fewer set"
                  className="h-12 w-9 rounded-[var(--radius)] border border-border text-lg font-semibold"
                >
                  −
                </button>
                <span className="tnum w-6 text-center text-lg font-semibold">{setsToAdd}</span>
                <button
                  type="button"
                  onClick={() => setSetsToAdd((n) => Math.min(12, n + 1))}
                  aria-label="One more set"
                  className="h-12 w-9 rounded-[var(--radius)] border border-border text-lg font-semibold"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() => addSet()}
            className="mt-2 min-h-[48px] w-full rounded-[var(--radius)] text-sm font-bold disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            {busy ? "Saving…" : setsToAdd === 1 ? "Add set" : `Add ${setsToAdd} sets`}
          </button>
          {/* The one gesture this screen does not otherwise advertise. Effort
              is rated after a set, not before, and adding three sets at once
              cannot carry one RIR for all three — so the rating lives on the
              set, and the set has to say so. */}
          <p className="mt-2 text-[11px] leading-snug text-text-dim">
            Tap a logged set to fix its load or reps, or to record RIR.
            {exercise.is_unilateral
              ? " Unilateral — log each side as its own set if they differ."
              : ""}
          </p>
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
                        rir={editRir}
                        showRir
                        disabled={!canWrite || busy}
                        onLoad={setEditLoad}
                        onReps={setEditReps}
                        onRir={setEditRir}
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
                            {set.rir != null ? ` · ${set.rir}` : ""}
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
                      rir={editRir}
                      showRir={false}
                      disabled={!canWrite || busy}
                      onLoad={setEditLoad}
                      onReps={setEditReps}
                      onRir={setEditRir}
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
  rir,
  showRir,
  disabled,
  onLoad,
  onReps,
  onRir,
  onCommit,
  onCancel,
}: {
  label: string;
  hue: string;
  load: string;
  reps: string;
  rir: string;
  /** Only on an existing set: effort is rated after the set, not before. */
  showRir: boolean;
  disabled: boolean;
  onLoad: (value: string) => void;
  onReps: (value: string) => void;
  onRir: (value: string) => void;
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
      // The muscle's own colour, not hypertrophy's: §4 asks for the set rows
      // to carry the muscle, and the editor is the row opened up. Mixed to a
      // wash rather than used flat, since the muscle tokens are text-weight
      // and have no tint of their own.
      style={{
        borderColor: `color-mix(in oklab, ${hue} 55%, var(--border))`,
        background: `color-mix(in oklab, ${hue} 10%, var(--surface))`,
        borderRadius: 12,
      }}
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
      <span className="text-[10px] text-text-dim">×</span>
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
      {showRir ? (
        <>
          <span className="text-[10px] text-text-dim">RIR</span>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            max="10"
            value={rir}
            disabled={disabled}
            placeholder="—"
            aria-label={`Reps in reserve, ${label}`}
            onFocus={(event) => event.target.select()}
            onChange={(event) => onRir(event.target.value)}
            onKeyDown={keys}
            className={`${field} w-10`}
          />
        </>
      ) : null}
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
