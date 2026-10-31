"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { SectionTitle, wsColour } from "@/components/ui";
import {
  NOTE_CATEGORY_LABELS,
  WORKSTREAM_LABELS,
  type ContextNote,
  type DailyMetric,
  type DailyMetricDef,
  type NoteCategory,
} from "@/lib/types";

/**
 * Quick mode: the check-in that has to take under half a minute, or it stops
 * happening by Wednesday.
 *
 * Everything is optional and partial days are valid — a morning where you only
 * know you slept badly is still worth recording. A field left untouched stays
 * unrecorded rather than becoming a zero, because "not measured" and "zero"
 * are different facts and the analytics layer treats them differently.
 *
 * The dimensions come from the database, so adding one later is a row rather
 * than a change here.
 *
 * A 0-10 judgement is a tap on its number, not a drag: dragging a slider to
 * exactly 7 is a fiddly act of aim, and eight of them stacked full-width was a
 * screenful of scrolling for thirty seconds of honesty.
 *
 * Nothing is saved by pressing anything. A tap on a number is the record, as
 * it is everywhere else in this app; numbers typed and text written commit
 * when you leave the field. A Save button turns an answered question into an
 * unsaved one, and the one thing worse than a blank field is a filled-in
 * field whose value never reached the database.
 *
 * It sits open. Two taps to reach a slider meant the check-in that has to
 * take thirty seconds started with a question about whether to start it.
 *
 * The day's notes sit at the foot, read-only. They are written where they
 * belong - in a workstream, or against the day - and shown here because the
 * check-in is where you reconstruct how the day went.
 */

type Props = {
  date: string;
  defs: DailyMetricDef[];
  saved: DailyMetric[];
  /** The last value recorded before this day, shown as a reference only. */
  lastValues?: (DailyMetric & { metric_date: string })[];
  /** Everything written about this day, shown here but edited elsewhere. */
  notes?: ContextNote[];
  canWrite: boolean;
};

type Draft = Record<string, { numeric: number | null; text: string | null }>;

export function DailyCheckIn({
  date,
  defs,
  saved,
  lastValues = [],
  notes = [],
  canWrite,
}: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const initial = useMemo<Draft>(() => {
    const draft: Draft = {};
    for (const def of defs) {
      const row = saved.find((m) => m.metric === def.slug);
      draft[def.slug] = {
        numeric: row?.value_numeric === undefined ? null : row.value_numeric,
        text: row?.value_text ?? null,
      };
    }
    return draft;
  }, [defs, saved]);

  const [draft, setDraft] = useState<Draft>(initial);

  const quick = defs.filter((d) => d.in_quick_mode);
  const rest = defs.filter((d) => !d.in_quick_mode);
  const visible = expanded ? defs : quick;
  const recorded = Object.values(draft).filter(
    (v) => v.numeric !== null || (v.text && v.text.trim()),
  ).length;

  /**
   * One field, one write. Sending the whole draft each time would rewrite
   * every other dimension too, so a stale tab could quietly undo a value
   * recorded on your phone an hour earlier.
   */
  function set(
    slug: string,
    value: Partial<{ numeric: number | null; text: string | null }>,
  ) {
    const next = { ...draft[slug], ...value };
    setDraft((prev) => ({ ...prev, [slug]: next }));
    setError(null);
    startTransition(async () => {
      try {
        await write({
          action: "save_check_in",
          date,
          metrics: [
            { metric: slug, value_numeric: next.numeric, value_text: next.text },
          ],
        });
        setSavedAt(slug);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div>
      <SectionTitle
        aside={
          <span className="tnum">
            {recorded > 0 ? `${recorded} recorded` : "Nothing recorded yet"}
          </span>
        }
      >
        Daily check-in
      </SectionTitle>

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((def) => {
          if (def.kind === "text") {
            return (
              <div key={def.slug} className="sm:col-span-2">
                <TextField
                  def={def}
                  value={draft[def.slug]?.text ?? ""}
                  disabled={!canWrite || busy}
                  onChange={(text) => set(def.slug, { text })}
                />
              </div>
            );
          }
          // A slider is right for a 0-10 judgement and wrong for a quantity:
          // bodyweight to 0.1 kg is 1,700 positions, which no thumb can hit.
          const Field = def.kind === "number" ? NumberField : ScaleField;
          return (
            <Field
              key={def.slug}
              def={def}
              value={draft[def.slug]?.numeric ?? null}
              last={lastValues.find((v) => v.metric === def.slug) ?? null}
              disabled={!canWrite || busy}
              onChange={(numeric) => set(def.slug, { numeric })}
            />
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] leading-snug text-text-dim">
          {busy
            ? "Saving\u2026"
            : savedAt
              ? "Saved as you go."
              : "All optional. An untouched field stays unrecorded rather than becoming a zero; tap a selected number again to clear it."}
        </p>
        {rest.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="min-h-[40px] shrink-0 rounded-[var(--radius)] border border-border px-3 text-sm font-semibold"
          >
            {expanded ? "Fewer" : `+${rest.length} more`}
          </button>
        ) : null}
      </div>

      {notes.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-dim">
            Written about this day
          </div>
          <ul className="space-y-1.5">
            {notes.map((note) => {
              // A note wears its workstream's colour, the same hue that
              // workstream's figures carry below. Reading a stripe is faster
              // than reading a label, and relating the two is the whole point
              // of having them on one screen. A note about the day as a whole
              // belongs to no workstream and stays neutral.
              const hue = note.workstream ? wsColour(note.workstream) : "var(--border)";
              return (
                <li
                  key={note.id}
                  className="overflow-hidden rounded-[var(--radius)] px-3 py-2"
                  style={{
                    borderLeft: `4px solid ${hue}`,
                    background: note.workstream
                      ? `color-mix(in oklab, ${hue} 8%, var(--surface-2))`
                      : "var(--surface-2)",
                  }}
                >
                  <div
                    className="text-[10px] uppercase tracking-wide"
                    style={{ color: note.workstream ? hue : "var(--text-dim)" }}
                  >
                    {note.workstream ? `${WORKSTREAM_LABELS[note.workstream]} \u00b7 ` : ""}
                    {NOTE_CATEGORY_LABELS[note.category as NoteCategory] ?? note.category}
                    {note.tags.includes("important") ? " \u00b7 important" : ""}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug">
                    {note.content}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[10px] leading-snug text-text-dim">
            Shown here, edited where they were written — against the day, or inside a
            workstream.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function LastHint({
  last,
  unit,
  disabled,
  onAdopt,
}: {
  last: (DailyMetric & { metric_date: string }) | null;
  unit: string | null;
  disabled: boolean;
  onAdopt: (value: number) => void;
}) {
  if (!last || last.value_numeric == null) return null;
  const value = Number(last.value_numeric);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAdopt(value)}
      className="tnum text-[11px] text-text-faint underline underline-offset-2 disabled:no-underline"
      title="Use this value for today"
    >
      last {value}
      {unit ? ` ${unit}` : ""} · {last.metric_date.slice(5)}
    </button>
  );
}

function ScaleField({
  def,
  value,
  last,
  disabled,
  onChange,
}: {
  def: DailyMetricDef;
  value: number | null;
  last: (DailyMetric & { metric_date: string }) | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const min = Number(def.min_value ?? 0);
  const max = Number(def.max_value ?? 10);
  const step = Number(def.step ?? 1) || 1;
  const stops: number[] = [];
  for (let v = min; v <= max + 1e-9 && stops.length <= 13; v += step) {
    stops.push(Number(v.toFixed(2)));
  }
  // Up to thirteen stops fit as taps. A finer scale than that stays a slider
  // rather than becoming a row of targets too narrow to hit.
  const tappable = stops.length > 1 && stops.length <= 13;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`m-${def.slug}`} className="truncate text-sm font-medium">
          {def.label}
        </label>
        <div className="flex shrink-0 items-baseline gap-2">
          <LastHint last={last} unit={def.unit} disabled={disabled} onAdopt={onChange} />
          <span
            className="tnum text-sm font-semibold"
            style={{ color: value === null ? "var(--text-faint)" : "var(--text)" }}
          >
            {value === null ? "—" : `${value}${def.unit ? ` ${def.unit}` : ""}`}
          </span>
          {value !== null ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled}
              aria-label={`Clear ${def.label}`}
              className="text-[11px] text-text-faint underline underline-offset-2"
            >
              clear
            </button>
          ) : null}
        </div>
      </div>

      {tappable ? (
        <div
          role="radiogroup"
          aria-label={def.label}
          id={`m-${def.slug}`}
          className="mt-1 flex gap-px overflow-hidden rounded-[var(--radius)] border border-border"
        >
          {stops.map((stop) => {
            const on = value !== null && Math.abs(Number(value) - stop) < 1e-9;
            return (
              <button
                key={stop}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={disabled}
                // Tapping the value you are already on clears it, so a
                // misread stays correctable without hunting for "clear".
                onClick={() => onChange(on ? null : stop)}
                className="tnum min-w-0 flex-1 py-1.5 text-[11px] font-semibold tabular-nums disabled:opacity-40"
                style={{
                  background: on ? "var(--accent)" : "var(--surface-2)",
                  color: on ? "var(--accent-text)" : "var(--text-faint)",
                }}
              >
                {stop}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          id={`m-${def.slug}`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value ?? (min + max) / 2}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="mt-1 h-6 w-full"
          style={{ accentColor: value === null ? "var(--text-faint)" : "var(--accent)" }}
          aria-valuetext={value === null ? "not recorded" : String(value)}
        />
      )}

      {/* The prompt is there while you still need it and gone once answered. */}
      {def.help && value === null ? (
        <p className="mt-0.5 text-[10px] leading-snug text-text-faint">{def.help}</p>
      ) : null}
    </div>
  );
}

function NumberField({
  def,
  value,
  last,
  disabled,
  onChange,
}: {
  def: DailyMetricDef;
  value: number | null;
  last: (DailyMetric & { metric_date: string }) | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={`m-${def.slug}`} className="block truncate text-sm font-medium">
          {def.label}
        </label>
        {def.help && value === null ? (
          <p className="text-[10px] leading-snug text-text-faint">{def.help}</p>
        ) : null}
        <LastHint last={last} unit={def.unit} disabled={disabled} onAdopt={onChange} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Typed locally, written on blur or Enter. With nothing to press,
            a write per keystroke would send "5", "54", "54." and "54.3" for
            one bodyweight. */}
        <input
          id={`m-${def.slug}`}
          type="number"
          inputMode="decimal"
          defaultValue={value ?? ""}
          key={value ?? "empty"}
          min={def.min_value ?? undefined}
          max={def.max_value ?? undefined}
          step={def.step ?? "any"}
          disabled={disabled}
          placeholder="—"
          onBlur={(event) =>
            onChange(event.target.value === "" ? null : Number(event.target.value))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const raw = event.currentTarget.value;
              onChange(raw === "" ? null : Number(raw));
            }
          }}
          className="tnum h-10 w-20 rounded-[var(--radius)] border border-border bg-surface-2 px-2 text-right text-base"
        />
        {def.unit ? <span className="text-[11px] text-text-faint">{def.unit}</span> : null}
      </div>
    </div>
  );
}

function TextField({
  def,
  value,
  disabled,
  onChange,
}: {
  def: DailyMetricDef;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={`m-${def.slug}`} className="text-sm font-medium">
        {def.label}
      </label>
      {/* Written when you leave the field, for the same reason. */}
      <textarea
        id={`m-${def.slug}`}
        defaultValue={value}
        key={value}
        disabled={disabled}
        rows={2}
        placeholder={def.help ?? undefined}
        onBlur={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-sm"
      />
    </div>
  );
}
