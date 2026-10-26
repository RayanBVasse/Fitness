"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { SectionTitle } from "@/components/ui";
import type { DailyMetric, DailyMetricDef } from "@/lib/types";

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
 */

type Props = {
  date: string;
  defs: DailyMetricDef[];
  saved: DailyMetric[];
  /** The last value recorded before this day, shown as a reference only. */
  lastValues?: (DailyMetric & { metric_date: string })[];
  canWrite: boolean;
};

type Draft = Record<string, { numeric: number | null; text: string | null }>;

export function DailyCheckIn({ date, defs, saved, lastValues = [], canWrite }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

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

  function set(slug: string, value: Partial<{ numeric: number | null; text: string | null }>) {
    setJustSaved(false);
    setDraft((prev) => ({ ...prev, [slug]: { ...prev[slug], ...value } }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await write({
          action: "save_check_in",
          date,
          metrics: Object.entries(draft).map(([metric, value]) => ({
            metric,
            value_numeric: value.numeric,
            value_text: value.text,
          })),
        });
        setJustSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  // Collapsed by default. At the gym the primary action is starting a session,
  // and eight sliders between it and the top of the screen would bury it.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-text-dim">
            Daily check-in
          </span>
          <span className="tnum text-sm text-text-faint">
            {recorded > 0 ? `${recorded} recorded` : "Nothing recorded"}
          </span>
        </span>
        <span
          className="shrink-0 rounded-[var(--radius)] border border-border px-3 py-2 text-sm font-semibold"
          style={{ color: "var(--accent)" }}
        >
          {recorded > 0 ? "Edit" : "Add"}
        </span>
      </button>
    );
  }

  return (
    <div>
      <SectionTitle
        aside={
          <button type="button" onClick={() => setOpen(false)} className="underline underline-offset-2">
            Close
          </button>
        }
      >
        Daily check-in
      </SectionTitle>

      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
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

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!canWrite || busy}
          className="min-h-[48px] flex-1 rounded-[var(--radius)] text-base font-bold disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          {busy ? "Saving…" : justSaved ? "Saved" : "Save check-in"}
        </button>
        {rest.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="min-h-[48px] rounded-[var(--radius)] border border-border px-3 text-sm font-semibold"
          >
            {expanded ? "Fewer" : `+${rest.length} more`}
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-text-faint">
        All optional, and editable through the day. An untouched field stays unrecorded rather
        than becoming a zero; tap a selected number again to clear it.
      </p>

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
        <input
          id={`m-${def.slug}`}
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          min={def.min_value ?? undefined}
          max={def.max_value ?? undefined}
          step={def.step ?? "any"}
          disabled={disabled}
          placeholder="—"
          onChange={(event) =>
            onChange(event.target.value === "" ? null : Number(event.target.value))
          }
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
      <textarea
        id={`m-${def.slug}`}
        value={value}
        disabled={disabled}
        rows={2}
        placeholder={def.help ?? undefined}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-sm"
      />
    </div>
  );
}
