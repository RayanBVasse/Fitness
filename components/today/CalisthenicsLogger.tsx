"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { SectionTitle } from "@/components/ui";
import type {
  AssistanceType,
  CalisthenicsEntry,
  LastSkillSetting,
  Skill,
  SkillVariation,
} from "@/lib/types";

/**
 * Skill logging, per variation.
 *
 * Variations are never pooled: a banded handstand push-up and a freestanding
 * one are different skills that happen to share a name, and averaging them
 * would hide the thing you are actually trying to improve.
 *
 * Attempts are not carried forward from last time — last session's attempt
 * count is not a default for this one — but assistance is, because that
 * changes slowly.
 *
 * A logged entry is editable: tapping it reopens this same panel on that
 * entry's own numbers. One panel rather than a second cramped editor, because
 * an entry is six fields and a miscounted set of attempts is worth correcting
 * rather than deleting. The skill variation stays fixed: changing it would
 * hand one skill another's history.
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
  canWrite,
}: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState<CalisthenicsEntry[]>(initialEntries);
  const [variationId, setVariationId] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [bestHold, setBestHold] = useState("");
  const [assistanceId, setAssistanceId] = useState<number | null>(null);
  const [controlled, setControlled] = useState<{ up: boolean; down: boolean }>({
    up: false,
    down: false,
  });
  const [showAll, setShowAll] = useState(false);
  /** The logged entry being corrected, if the panel is open on one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(variations.map((v) => [v.id, v])), [variations]);
  const variation = variationId === null ? null : (byId.get(variationId) ?? null);
  const skillName = variation
    ? (skills.find((s) => s.id === variation.skill_id)?.name ?? "")
    : "";

  function choose(id: number) {
    setVariationId(id);
    setEditingId(null);
    setShowAll(false);
    setAttempts(0);
    setSuccesses(0);
    setBestHold("");
    setControlled({ up: false, down: false });
    const previous = lastSettings.find((s) => s.skill_variation_id === id);
    setAssistanceId(previous?.assistance_id ?? null);
  }

  /** Reopen the panel on a logged entry, at its own numbers. */
  function openEntry(entry: CalisthenicsEntry) {
    setError(null);
    setEditingId(entry.id);
    setVariationId(entry.skill_variation_id);
    setShowAll(false);
    setAttempts(entry.attempts ?? 0);
    setSuccesses(entry.successful_attempts ?? 0);
    setBestHold(entry.best_hold_seconds != null ? String(Number(entry.best_hold_seconds)) : "");
    setAssistanceId(entry.assistance_id ?? null);
    setControlled({
      up: entry.controlled_ascent === true,
      down: entry.controlled_descent === true,
    });
  }

  function closePanel() {
    setEditingId(null);
    setVariationId(null);
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

  function save() {
    if (variationId === null) return;
    // Zero attempts means the count was never taken, not that nothing was
    // tried; it stays unrecorded rather than becoming a logged zero.
    const shared = {
      attempts: attempts || null,
      successful_attempts: attempts ? successes : null,
      best_hold_seconds: bestHold === "" ? null : Number(bestHold),
      controlled_ascent: controlled.up ? true : null,
      controlled_descent: controlled.down ? true : null,
      assistance_id: assistanceId,
    };
    const correcting = editingId;
    run(async () => {
      if (correcting) {
        const result = await write<{ entry: CalisthenicsEntry }>({
          action: "update_calisthenics_entry",
          entry_id: correcting,
          ...shared,
        });
        setEntries((prev) => prev.map((e) => (e.id === correcting ? result.entry : e)));
      } else {
        const result = await write<{ entry: CalisthenicsEntry }>({
          action: "log_calisthenics_entry",
          session_id: sessionId,
          session_block_id: sessionBlockId,
          skill_variation_id: variationId,
          ...shared,
        });
        setEntries((prev) => [...prev, result.entry]);
      }
      closePanel();
    });
  }

  function remove(id: string) {
    run(async () => {
      await write({ action: "delete_calisthenics_entry", entry_id: id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (editingId === id) closePanel();
    });
  }

  const recent = recentVariationIds
    .map((id) => byId.get(id))
    .filter((v): v is SkillVariation => !!v);

  return (
    <div className="space-y-3">
      <SectionTitle aside={entries.length > 0 ? `${entries.length} logged` : null}>
        Calisthenics
      </SectionTitle>

      <div className="flex flex-wrap gap-1.5">
        {(showAll ? variations : recent).map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => choose(v.id)}
            aria-pressed={v.id === variationId}
            className="min-h-[36px] rounded-full border px-3 text-xs font-semibold"
            style={{
              borderColor: v.id === variationId ? "var(--accent)" : "var(--border)",
              color: v.id === variationId ? "var(--accent)" : "var(--text-dim)",
            }}
          >
            {v.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="min-h-[36px] rounded-full border border-dashed border-border px-3 text-xs font-semibold text-text-faint"
        >
          {showAll ? "Recent only" : `All ${variations.length}`}
        </button>
      </div>

      {variation ? (
        <div
          className="rounded-[var(--radius)] border p-3"
          style={{ borderColor: "var(--accent)", background: "var(--surface-2)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-text-faint">
                {editingId ? `Correcting · ${skillName}` : skillName}
              </div>
              <div className="truncate font-semibold">{variation.name}</div>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="shrink-0 text-[11px] text-text-faint underline underline-offset-2"
            >
              {editingId ? "Cancel" : "Close"}
            </button>
          </div>
          {variation.criteria_notes ? (
            <p className="mt-1 text-[11px] leading-snug text-text-faint">
              {variation.criteria_notes}
            </p>
          ) : null}

          <p className="mt-2 text-[10px] leading-snug text-text-faint">
            Tapping a success counts an attempt too. Successes never exceed attempts.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Counter
              label="Attempts"
              value={attempts}
              onChange={(n) => {
                setAttempts(n);
                // Lowering attempts below successes lowers successes with it.
                if (successes > n) setSuccesses(n);
              }}
            />
            <Counter
              label="Successes"
              value={successes}
              onChange={(n) => {
                setSuccesses(n);
                // Logging a success you have not logged an attempt for is not
                // an error: it means both happened. Raise attempts to match
                // rather than refusing the tap.
                if (n > attempts) setAttempts(n);
              }}
            />
          </div>

          <div className="mt-3 flex items-end gap-2">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-faint">
                Best hold (s)
              </div>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={bestHold}
                placeholder="—"
                onChange={(event) => setBestHold(event.target.value)}
                className="tnum min-h-[44px] w-20 rounded-[var(--radius)] border border-border bg-surface px-2 text-center text-base"
                aria-label="Best hold seconds"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-text-faint">
                Assistance
              </div>
              <select
                value={assistanceId ?? ""}
                onChange={(event) =>
                  setAssistanceId(event.target.value === "" ? null : Number(event.target.value))
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
          </div>

          <div className="mt-3 flex gap-2">
            <Toggle
              label="Controlled up"
              on={controlled.up}
              onClick={() => setControlled((c) => ({ ...c, up: !c.up }))}
            />
            <Toggle
              label="Controlled down"
              on={controlled.down}
              onClick={() => setControlled((c) => ({ ...c, down: !c.down }))}
            />
          </div>

          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={save}
            className="mt-3 min-h-[48px] w-full rounded-[var(--radius)] text-base font-bold disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-text)" }}
          >
            {editingId ? "Save changes" : "Save entry"}
          </button>
        </div>
      ) : null}

      {entries.length > 0 ? (
        <ul className="space-y-1.5">
          {entries.map((entry) => {
            const name = byId.get(entry.skill_variation_id)?.name ?? "Skill";
            return (
              <li
                key={entry.id}
                className="flex items-center gap-1 rounded-[var(--radius)] border px-1 py-1"
                style={{
                  borderColor: editingId === entry.id ? "var(--accent)" : "var(--border)",
                }}
              >
                {/* The row is the edit control, as the set tiles are. */}
                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={() => openEntry(entry)}
                  aria-label={`Edit this entry of ${name}`}
                  className="flex min-h-[36px] min-w-0 flex-1 items-center gap-2 px-2 text-left disabled:opacity-40"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <span className="tnum shrink-0 text-sm text-text-dim">
                    {entry.attempts != null
                      ? `${entry.successful_attempts ?? 0}/${entry.attempts}`
                      : "—"}
                    {entry.best_hold_seconds != null
                      ? ` · ${Number(entry.best_hold_seconds)}s`
                      : ""}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={() => remove(entry.id)}
                  aria-label={`Delete this entry of ${name}`}
                  className="min-h-[36px] shrink-0 px-2 text-sm text-text-faint disabled:opacity-40"
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

function Counter({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="flex items-center gap-1">
        <StepButton label={`Decrease ${label}`} onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </StepButton>
        <span className="tnum min-w-[2.5rem] text-center text-lg font-semibold">{value}</span>
        <StepButton
          label={`Increase ${label}`}
          onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}
        >
          +
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-11 w-11 rounded-[var(--radius)] border border-border text-lg font-semibold"
    >
      {children}
    </button>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="min-h-[40px] flex-1 rounded-[var(--radius)] border px-2 text-xs font-semibold"
      style={{
        borderColor: on ? "var(--accent)" : "var(--border)",
        color: on ? "var(--accent)" : "var(--text-dim)",
      }}
    >
      {label}
    </button>
  );
}
