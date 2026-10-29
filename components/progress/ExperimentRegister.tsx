"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { SectionTitle, wsColour } from "@/components/ui";
import {
  EXPERIMENT_OUTCOME_LABELS,
  EXPERIMENT_STATUS_LABELS,
  type Experiment,
  type ExperimentOutcome,
  type ExperimentStatus,
  type Workstream,
} from "@/lib/types";

/**
 * Hypotheses, written down before they are forgotten.
 *
 * Training throws these up constantly — whether the first-pull change is
 * helping, whether calisthenics before hypertrophy holds its technique, what
 * provokes the knee. They get generated in conversation, acted on for a
 * fortnight, and lost, and the next conversation generates a fresh set.
 *
 * Three fields do the work. The hypothesis is what you think. The measurement
 * is what would settle it, written BEFORE the evidence arrives so the measure
 * cannot be picked afterwards to fit what happened. The comparison is what
 * counts as a comparable observation — the one always left out, and the
 * reason a thing can be "tested" for a month and settle nothing.
 *
 * The outcome is yours to write. Nothing here computes whether a hypothesis
 * was supported, and "inconclusive" is offered first among the verdicts
 * because it is the commonest honest answer and the easiest to skip past.
 */

const STATUSES: ExperimentStatus[] = ["proposed", "collecting", "concluded", "abandoned"];
const OUTCOMES: ExperimentOutcome[] = ["inconclusive", "supported", "not_supported"];

type Draft = {
  id: string | null;
  title: string;
  hypothesis: string;
  measurement: string;
  comparison: string;
  workstream: Workstream | null;
  status: ExperimentStatus;
  outcome: ExperimentOutcome | null;
  outcome_note: string;
};

const blank: Draft = {
  id: null,
  title: "",
  hypothesis: "",
  measurement: "",
  comparison: "",
  workstream: null,
  status: "collecting",
  outcome: null,
  outcome_note: "",
};

export function ExperimentRegister({
  experiments,
  today,
}: {
  experiments: Experiment[];
  today: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  function save(d: Draft) {
    const finished = d.status === "concluded" || d.status === "abandoned";
    run(async () => {
      await write({
        action: "save_experiment",
        experiment_id: d.id,
        title: d.title.trim(),
        hypothesis: d.hypothesis.trim(),
        measurement: d.measurement.trim(),
        comparison: d.comparison.trim() || null,
        workstream: d.workstream,
        status: d.status,
        // Dated from the day it started collecting, and closed on the day it
        // stopped. Neither is asked for: both are knowable from when you
        // changed the status, and a date field nobody fills is a date field
        // that lies.
        started_on: d.id ? undefined : d.status === "collecting" ? today : null,
        ended_on: finished ? today : null,
        outcome: finished ? d.outcome : null,
        outcome_note: finished ? d.outcome_note.trim() || null : null,
      });
      setDraft(null);
    });
  }

  const live = experiments.filter((e) => e.status === "collecting" || e.status === "proposed");

  return (
    <div className="space-y-3">
      <SectionTitle aside={live.length > 0 ? `${live.length} open` : null}>
        Experiments
      </SectionTitle>

      {experiments.length === 0 && !draft ? (
        <p className="text-[11px] leading-snug text-text-dim">
          Nothing on the register. A hypothesis worth keeping is one you could be wrong about
          and would notice — &ldquo;calisthenics before hypertrophy holds its technique
          better&rdquo; rather than &ldquo;train harder&rdquo;.
        </p>
      ) : null}

      <ul className="space-y-1.5">
        {experiments.map((e) => {
          const open = openId === e.id;
          const hue = e.workstream ? wsColour(e.workstream) : "var(--accent)";
          const live = e.status === "collecting" || e.status === "proposed";
          return (
            <li
              key={e.id}
              className="rounded-[var(--radius)] border"
              style={{ borderColor: open ? hue : "var(--border)" }}
            >
              <button
                type="button"
                onClick={() => setOpenId(open ? null : e.id)}
                className="flex min-h-[44px] w-full items-start gap-2 px-3 py-2 text-left"
              >
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: hue, opacity: live ? 1 : 0.4 }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{e.title}</span>
                  <span className="block text-[10px] text-text-dim">
                    {EXPERIMENT_STATUS_LABELS[e.status]}
                    {e.outcome ? ` · ${EXPERIMENT_OUTCOME_LABELS[e.outcome]}` : ""}
                    {e.started_on ? ` · from ${shortDate(e.started_on)}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-text-faint" aria-hidden>
                  {open ? "▾" : "▸"}
                </span>
              </button>

              {open ? (
                <div className="space-y-2 border-t border-border px-3 py-2 text-[12px] leading-snug">
                  <Field label="Hypothesis">{e.hypothesis}</Field>
                  <Field label="What would settle it">{e.measurement}</Field>
                  {e.comparison ? (
                    <Field label="Comparable observations">{e.comparison}</Field>
                  ) : (
                    <p className="text-[11px] text-text-faint">
                      No comparison recorded. Without one, evidence gathers and never settles
                      anything.
                    </p>
                  )}
                  {e.outcome ? (
                    <Field label={EXPERIMENT_OUTCOME_LABELS[e.outcome]}>
                      {e.outcome_note ?? "No note."}
                    </Field>
                  ) : null}

                  <div className="flex gap-3 pt-1 text-[11px] text-text-dim">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setDraft({
                          id: e.id,
                          title: e.title,
                          hypothesis: e.hypothesis,
                          measurement: e.measurement,
                          comparison: e.comparison ?? "",
                          workstream: e.workstream,
                          status: e.status,
                          outcome: e.outcome,
                          outcome_note: e.outcome_note ?? "",
                        })
                      }
                      className="underline underline-offset-2"
                    >
                      edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await write({ action: "delete_experiment", experiment_id: e.id });
                          setOpenId(null);
                        })
                      }
                      className="underline underline-offset-2"
                    >
                      remove
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {draft ? (
        <Form
          draft={draft}
          busy={busy}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => save(draft)}
        />
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => setDraft(blank)}
          className="min-h-[44px] w-full rounded-[var(--radius)] border border-dashed border-border text-sm font-semibold text-text-dim disabled:opacity-40"
        >
          + Add a hypothesis
        </button>
      )}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      <p className="text-[10px] leading-snug text-text-faint">
        The verdict is yours to write. Nothing on this screen decides whether a hypothesis was
        supported, and an experiment that ran its course without settling anything is a result
        rather than a failure.
      </p>
    </div>
  );
}

function Form({
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  busy: boolean;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const finished = draft.status === "concluded" || draft.status === "abandoned";
  const ready =
    draft.title.trim() && draft.hypothesis.trim() && draft.measurement.trim() && !busy;

  return (
    <div
      className="space-y-2 rounded-[var(--radius)] border p-3"
      style={{ borderColor: "var(--accent)", background: "var(--surface-2)" }}
    >
      <Input
        label="Title"
        value={draft.title}
        placeholder="Calisthenics earlier in the session"
        disabled={busy}
        onChange={(v) => onChange({ ...draft, title: v })}
      />
      <Input
        label="Hypothesis"
        value={draft.hypothesis}
        rows={2}
        placeholder="Doing the floating tuck before hypertrophy improves technical consistency."
        disabled={busy}
        onChange={(v) => onChange({ ...draft, hypothesis: v })}
      />
      <Input
        label="What would settle it"
        value={draft.measurement}
        rows={2}
        placeholder="Success rate and quality ratings on the floating tuck."
        disabled={busy}
        onChange={(v) => onChange({ ...draft, measurement: v })}
        help="Written now, before the evidence. Deciding the measure afterwards is how a hypothesis gets confirmed by whatever happened."
      />
      <Input
        label="Comparable observations"
        value={draft.comparison}
        rows={2}
        placeholder="Same variation, same assistance, both orders within a fortnight."
        disabled={busy}
        onChange={(v) => onChange({ ...draft, comparison: v })}
        help="What two sessions must share to be worth comparing."
      />

      <div>
        <Label>Status</Label>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <Chip
              key={s}
              on={draft.status === s}
              disabled={busy}
              onClick={() =>
                onChange({
                  ...draft,
                  status: s,
                  // Reopening drops the verdict: one left behind would
                  // describe evidence still being collected.
                  ...(s === "concluded" || s === "abandoned"
                    ? {}
                    : { outcome: null, outcome_note: "" }),
                })
              }
            >
              {EXPERIMENT_STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>
      </div>

      {finished ? (
        <div>
          <Label>Outcome</Label>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOMES.map((o) => (
              <Chip
                key={o}
                on={draft.outcome === o}
                disabled={busy}
                onClick={() => onChange({ ...draft, outcome: draft.outcome === o ? null : o })}
              >
                {EXPERIMENT_OUTCOME_LABELS[o]}
              </Chip>
            ))}
          </div>
          <Input
            label=""
            value={draft.outcome_note}
            rows={2}
            placeholder="What the evidence actually showed."
            disabled={busy}
            onChange={(v) => onChange({ ...draft, outcome_note: v })}
          />
        </div>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          disabled={!ready}
          onClick={onSave}
          className="min-h-[44px] flex-1 rounded-[var(--radius)] text-sm font-bold disabled:opacity-40"
          style={{ background: "var(--accent)", color: "var(--accent-text)" }}
        >
          {busy ? "Saving…" : draft.id ? "Save changes" : "Add to the register"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] rounded-[var(--radius)] border border-border px-3 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-text-dim">{label}</div>
      <p className="whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] uppercase tracking-wide text-text-dim">{children}</div>
  );
}

function Input({
  label,
  value,
  rows,
  placeholder,
  disabled,
  help,
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  placeholder?: string;
  disabled: boolean;
  help?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      {label ? <Label>{label}</Label> : null}
      {rows ? (
        <textarea
          value={value}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm"
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[44px] w-full rounded-[var(--radius)] border border-border bg-surface px-3 text-sm"
        />
      )}
      {help ? <p className="mt-0.5 text-[10px] leading-snug text-text-faint">{help}</p> : null}
    </label>
  );
}

function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className="min-h-[34px] rounded-full border px-2.5 text-[11px] font-semibold disabled:opacity-40"
      style={{
        borderColor: on ? "var(--accent)" : "var(--border)",
        color: on ? "var(--accent)" : "var(--text-dim)",
      }}
    >
      {children}
    </button>
  );
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1] ?? m}`;
}
