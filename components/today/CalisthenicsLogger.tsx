"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { Chip, SectionTitle, wsColour } from "@/components/ui";
import type {
  AssistanceType,
  CalisthenicsAttempt,
  CalisthenicsEntry,
  LastSkillSetting,
  Skill,
  SkillVariation,
} from "@/lib/types";

/**
 * Skill logging, one row per attempt.
 *
 * The counters this replaces asked you to type a number. Now each tap writes
 * an attempt, and attempts, successes, success rate, best hold, total hold
 * and the control counts are all read back off those rows. Two figures about
 * one entry can no longer disagree, and a success on the fifth try stays
 * distinguishable from a success on the first.
 *
 * Variations are never pooled: a banded handstand push-up and a freestanding
 * one are different skills that happen to share a name. `difficulty` ranks
 * them within their own skill so that moving up a variation and improving at
 * one are different measurements — and the rank is never compared across
 * skills, where it would mean nothing.
 *
 * The entry is created by the first attempt, not by choosing a variation,
 * for the same reason a workstream block is: selecting something is not
 * evidence that it happened.
 */

type Props = {
  sessionId: string;
  sessionBlockId: string | null;
  skills: Skill[];
  variations: SkillVariation[];
  assistanceTypes: AssistanceType[];
  recentVariationIds: number[];
  lastSettings: LastSkillSetting[];
  initialEntries: CalisthenicsEntry[];
  initialAttempts: CalisthenicsAttempt[];
  canWrite: boolean;
};

export function CalisthenicsLogger({
  sessionId,
  sessionBlockId,
  skills,
  variations,
  assistanceTypes,
  recentVariationIds,
  lastSettings,
  initialEntries,
  initialAttempts,
  canWrite,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<CalisthenicsEntry[]>(initialEntries);
  const [attempts, setAttempts] = useState<CalisthenicsAttempt[]>(initialAttempts);
  const [variationId, setVariationId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(variations.map((v) => [v.id, v])), [variations]);
  const variation = variationId === null ? null : (byId.get(variationId) ?? null);
  const skillName = variation
    ? (skills.find((s) => s.id === variation.skill_id)?.name ?? "")
    : "";
  const hue = wsColour("calisthenics");

  /** One entry per variation per session; choosing it again resumes it. */
  const entry = entries.find((e) => e.skill_variation_id === variationId) ?? null;
  const entryAttempts = attempts
    .filter((a) => a.entry_id === entry?.id)
    .sort((a, b) => a.ordinal - b.ordinal);

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

  function choose(id: number) {
    setVariationId(id);
    setShowAll(false);
    setDetailId(null);
  }

  /** The entry for this variation, created by the attempt that needs it. */
  async function ensureEntry(): Promise<CalisthenicsEntry> {
    if (entry) return entry;
    if (variationId === null) throw new Error("No skill selected.");
    const previous = lastSettings.find((s) => s.skill_variation_id === variationId);
    const result = await write<{ entry: CalisthenicsEntry }>({
      action: "log_calisthenics_entry",
      session_id: sessionId,
      session_block_id: sessionBlockId,
      skill_variation_id: variationId,
      // Assistance carries over because it changes slowly. Counts never do.
      assistance_id: previous?.assistance_id ?? null,
    });
    setEntries((prev) => [...prev, result.entry]);
    return result.entry;
  }

  function logAttempt(succeeded: boolean) {
    run(async () => {
      const target = await ensureEntry();
      const result = await write<{ attempt: CalisthenicsAttempt }>({
        action: "log_attempt_row",
        entry_id: target.id,
        succeeded,
      });
      setAttempts((prev) => [...prev, result.attempt]);
    });
  }

  function patchAttempt(id: string, patch: Partial<CalisthenicsAttempt>) {
    run(async () => {
      const result = await write<{ attempt: CalisthenicsAttempt }>({
        action: "update_attempt_row",
        attempt_id: id,
        ...patch,
      });
      setAttempts((prev) => prev.map((a) => (a.id === id ? result.attempt : a)));
    });
  }

  function removeAttempt(id: string) {
    run(async () => {
      await write({ action: "delete_attempt_row", attempt_id: id });
      setAttempts((prev) => prev.filter((a) => a.id !== id));
      if (detailId === id) setDetailId(null);
    });
  }

  function removeEntry(id: string) {
    run(async () => {
      await write({ action: "delete_calisthenics_entry", entry_id: id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setAttempts((prev) => prev.filter((a) => a.entry_id !== id));
    });
  }

  function setEntryField(target: CalisthenicsEntry, patch: Partial<CalisthenicsEntry>) {
    const next = { ...target, ...patch };
    run(async () => {
      const result = await write<{ entry: CalisthenicsEntry }>({
        action: "update_calisthenics_entry",
        entry_id: target.id,
        // Carried through untouched. An imported entry holds its counts in
        // these columns, and changing its assistance or quality must not
        // quietly erase the summary it was reconstructed from. A live entry
        // has them null already, so this is a no-op there.
        attempts: target.attempts,
        successful_attempts: target.successful_attempts,
        best_hold_seconds: target.best_hold_seconds,
        controlled_ascent: target.controlled_ascent,
        controlled_descent: target.controlled_descent,
        assistance_id: next.assistance_id,
        quality_10: next.quality_10,
      });
      setEntries((prev) => prev.map((e) => (e.id === target.id ? result.entry : e)));
    });
  }

  /** Every figure about an entry, counted from its rows. */
  function derive(target: CalisthenicsEntry) {
    const rows = attempts.filter((a) => a.entry_id === target.id);
    if (rows.length === 0) {
      // An imported entry: it has summaries and no rows, and is left as it is
      // rather than having attempts invented for it.
      return {
        basis: "summary" as const,
        attempts: target.attempts,
        successes: target.successful_attempts,
        bestHold: target.best_hold_seconds,
      };
    }
    const holds = rows.filter((a) => a.succeeded && a.hold_seconds != null);
    return {
      basis: "attempt" as const,
      attempts: rows.length,
      successes: rows.filter((a) => a.succeeded).length,
      bestHold:
        holds.length > 0 ? Math.max(...holds.map((a) => Number(a.hold_seconds))) : null,
    };
  }

  const recent = recentVariationIds
    .map((id) => byId.get(id))
    .filter((v): v is SkillVariation => !!v);
  const detail = entryAttempts.find((a) => a.id === detailId) ?? null;

  return (
    <div className="space-y-3">
      <SectionTitle
        tone={hue}
        aside={entries.length > 0 ? `${entries.length} logged` : null}
      >
        Calisthenics
      </SectionTitle>

      <div className="flex flex-wrap gap-1.5">
        {(showAll ? variations : recent).map((v) => (
          <Chip key={v.id} on={v.id === variationId} hue={hue} onClick={() => choose(v.id)}>
            {v.name}
            {v.difficulty != null ? (
              <span className="ml-1 text-[10px] font-normal opacity-70">L{v.difficulty}</span>
            ) : null}
          </Chip>
        ))}
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="min-h-[38px] rounded-full border border-dashed border-border px-3 text-xs font-semibold text-text-dim"
        >
          {showAll ? "Recent only" : `All ${variations.length}`}
        </button>
      </div>

      {variation ? (
        <div
          className="rounded-[var(--radius)] border p-3"
          style={{ borderColor: hue, background: "var(--surface-2)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-text-dim">
                {skillName}
                {variation.difficulty != null ? ` · level ${variation.difficulty}` : ""}
              </div>
              <div className="truncate font-semibold">{variation.name}</div>
            </div>
            <button
              type="button"
              onClick={() => setVariationId(null)}
              className="shrink-0 text-[11px] text-text-dim underline underline-offset-2"
            >
              Close
            </button>
          </div>

          {variation.criteria_notes ? (
            <p className="mt-1 text-[11px] leading-snug text-text-dim">
              {variation.criteria_notes}
            </p>
          ) : null}

          {/* Each tap is an attempt. Nothing is typed and nothing is summed. */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() => logAttempt(true)}
              className="min-h-[64px] rounded-[var(--radius)] border text-base font-bold disabled:opacity-40"
              style={{
                borderColor: "var(--stood)",
                color: "var(--stood)",
                background: "var(--stood-bg)",
              }}
            >
              Success
            </button>
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() => logAttempt(false)}
              className="min-h-[64px] rounded-[var(--radius)] border text-base font-bold disabled:opacity-40"
              style={{
                borderColor: "var(--missed)",
                color: "var(--missed)",
                background: "var(--missed-bg)",
              }}
            >
              Missed
            </button>
          </div>

          {entryAttempts.length > 0 ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-1">
                {entryAttempts.map((a) => {
                  const open = a.id === detailId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setDetailId(open ? null : a.id)}
                      aria-label={`Attempt ${a.ordinal}, ${a.succeeded ? "success" : "missed"}`}
                      className="tnum flex h-9 min-w-[36px] items-center justify-center rounded-md border px-1.5 text-[11px] font-bold"
                      style={{
                        borderColor: a.succeeded ? "var(--stood)" : "var(--missed)",
                        color: a.succeeded ? "var(--stood)" : "var(--missed)",
                        background: open ? "var(--surface)" : "transparent",
                      }}
                    >
                      {a.ordinal}
                      {a.hold_seconds != null ? (
                        <span className="ml-0.5 font-normal">{Number(a.hold_seconds)}s</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <p className="tnum mt-1.5 text-[11px] text-text-dim">
                {entryAttempts.filter((a) => a.succeeded).length}/{entryAttempts.length} stood
                {(() => {
                  const up = entryAttempts.filter((a) => a.controlled_ascent).length;
                  const down = entryAttempts.filter((a) => a.controlled_descent).length;
                  return `${up > 0 ? ` · ${up} controlled up` : ""}${
                    down > 0 ? ` · ${down} controlled down` : ""
                  }`;
                })()}
              </p>
            </>
          ) : null}

          {detail ? (
            <AttemptDetail
              attempt={detail}
              hue={hue}
              disabled={!canWrite || busy}
              onPatch={(patch) => patchAttempt(detail.id, patch)}
              onDelete={() => removeAttempt(detail.id)}
              onClose={() => setDetailId(null)}
            />
          ) : null}

          {entry ? (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-text-dim">
                  Assistance
                </div>
                <select
                  value={entry.assistance_id ?? ""}
                  disabled={!canWrite || busy}
                  onChange={(event) =>
                    setEntryField(entry, {
                      assistance_id:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                  className="min-h-[44px] w-full rounded-[var(--radius)] border border-border bg-surface px-2 text-sm"
                  aria-label="Assistance"
                >
                  <option value="">Not recorded</option>
                  {assistanceTypes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-text-dim">
                  Technical quality {entry.quality_10 ? `· ${entry.quality_10}/10` : "· not rated"}
                </div>
                <div className="flex gap-1">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={!canWrite || busy}
                      onClick={() =>
                        setEntryField(entry, { quality_10: entry.quality_10 === n ? null : n })
                      }
                      aria-label={`Quality ${n} of 10`}
                      className="tnum h-8 flex-1 rounded-md border text-[11px] font-semibold disabled:opacity-40"
                      style={{
                        borderColor: entry.quality_10 === n ? hue : "var(--border)",
                        color: entry.quality_10 === n ? hue : "var(--text-dim)",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-text-dim">
                  How it looked, separate from whether it worked.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="space-y-1.5">
          {entries.map((e) => {
            const name = byId.get(e.skill_variation_id)?.name ?? "Skill";
            const d = derive(e);
            return (
              <li
                key={e.id}
                className="flex items-center gap-1 rounded-[var(--radius)] border px-1 py-1"
                style={{
                  borderColor: e.skill_variation_id === variationId ? hue : "var(--border)",
                }}
              >
                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={() => choose(e.skill_variation_id)}
                  aria-label={`Continue ${name}`}
                  className="flex min-h-[36px] min-w-0 flex-1 items-center gap-2 px-2 text-left disabled:opacity-40"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <span className="tnum shrink-0 text-sm text-text-dim">
                    {d.attempts != null ? `${d.successes ?? 0}/${d.attempts}` : "—"}
                    {d.bestHold != null ? ` · ${Number(d.bestHold)}s` : ""}
                    {d.basis === "summary" ? " ·" : ""}
                  </span>
                  {d.basis === "summary" ? (
                    <span className="shrink-0 text-[10px] text-text-dim">summary</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={() => removeEntry(e.id)}
                  aria-label={`Delete this entry of ${name}`}
                  className="min-h-[36px] shrink-0 px-2 text-sm text-text-dim disabled:opacity-40"
                >
                  ×
                </button>
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
    </div>
  );
}

/**
 * What one attempt actually involved. Everything here is optional — a tap that
 * only records "that one worked" is a complete record of what you chose to
 * observe, and a blank field is not a zero.
 */
function AttemptDetail({
  attempt,
  hue,
  disabled,
  onPatch,
  onDelete,
  onClose,
}: {
  attempt: CalisthenicsAttempt;
  hue: string;
  disabled: boolean;
  onPatch: (patch: Partial<CalisthenicsAttempt>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const num = (value: string) => (value.trim() === "" ? null : Number(value));

  /**
   * Committed on blur and on Enter. Blur alone is the usual pattern and the
   * usual pattern loses the value when the panel closes from under a focused
   * field, which on a phone is one mistimed tap away.
   */
  function field(
    key: "hold_seconds" | "negative_seconds",
    label: string,
    value: number | null,
  ) {
    const commit = (raw: string) => {
      const next = num(raw);
      if (next === (value ?? null)) return;
      onPatch({ [key]: next });
    };
    return (
      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-dim">
          {label}
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          defaultValue={value ?? ""}
          disabled={disabled}
          placeholder="—"
          aria-label={`${label}, attempt ${attempt.ordinal}`}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(event.currentTarget.value);
            }
          }}
          className="tnum h-10 w-16 rounded-[var(--radius)] border border-border bg-surface-2 px-2 text-center text-sm"
        />
      </label>
    );
  }

  return (
    <div
      className="mt-2 rounded-[var(--radius)] border p-2"
      style={{ borderColor: hue, background: "var(--surface)" }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold">Attempt {attempt.ordinal}</span>
        <span className="flex gap-2 text-[11px] text-text-dim">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPatch({ succeeded: !attempt.succeeded })}
            className="underline underline-offset-2"
          >
            mark {attempt.succeeded ? "missed" : "success"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onDelete}
            className="underline underline-offset-2"
          >
            delete
          </button>
          <button type="button" onClick={onClose} className="underline underline-offset-2">
            close
          </button>
        </span>
      </div>

      <div className="mt-2 flex items-end gap-2">
        {field("hold_seconds", "Hold (s)", attempt.hold_seconds)}
        {field("negative_seconds", "Negative (s)", attempt.negative_seconds)}
      </div>

      <div className="mt-2 flex gap-2">
        {(
          [
            ["controlled_ascent", "Controlled up"],
            ["controlled_descent", "Controlled down"],
          ] as const
        ).map(([field, label]) => {
          const on = attempt[field] === true;
          return (
            <button
              key={field}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onPatch({ [field]: on ? null : true })}
              className="min-h-[36px] flex-1 rounded-[var(--radius)] border px-2 text-[11px] font-semibold"
              style={{
                borderColor: on ? hue : "var(--border)",
                color: on ? hue : "var(--text-dim)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
