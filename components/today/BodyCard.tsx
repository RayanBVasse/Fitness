"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { SectionTitle } from "@/components/ui";
import type { Injury, InjuryObservation, ProvokingActivity } from "@/lib/types";

/**
 * The body, as one topic: what hurts, what provoked it, and how it was the
 * morning after.
 *
 * A pain-free day is the first thing offered, because it is the reading most
 * often not taken. A day you checked and felt nothing is evidence — the kind
 * that tells a recurrence from a bad week — and the table has a column for
 * it precisely so it cannot be confused with a day nobody asked about. The
 * absence of a row means the question was never put, and nothing on this
 * screen or any other may draw that as a nought.
 *
 * The next-morning reading is answered today about yesterday, which is why
 * it appears as a follow-up rather than as a field you fill in advance. It
 * is the only part of this that links a session to what it cost.
 *
 * No diagnosis anywhere. A site is a site, an activity is what you were
 * doing, and "worse after lunges" is a pattern rather than a cause.
 */

type Props = {
  date: string;
  sessionId: string | null;
  injuries: Injury[];
  activities: ProvokingActivity[];
  /** This day's readings and the previous day's. */
  observations: InjuryObservation[];
  canWrite: boolean;
};

export function BodyCard({
  date,
  sessionId,
  injuries,
  activities,
  observations,
  canWrite,
}: Props) {
  const tracked = injuries.filter((i) => i.is_active);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const today = observations.filter((o) => o.obs_date === date);
  // Yesterday's pain, not yet followed up. A pain-free day has nothing to
  // ask about: the schema refuses to hold a severity against it.
  const pending = observations.filter(
    (o) =>
      o.obs_date !== date &&
      !o.pain_free &&
      o.pain_next_morning_0_10 == null &&
      o.provenance === "logged",
  );

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

  if (tracked.length === 0) return null;

  return (
    <div className="space-y-3">
      <SectionTitle aside={today.length > 0 ? `${today.length} recorded` : null}>
        Body
      </SectionTitle>

      {/* Yesterday first: it is about a day that is finished, and answering
          it gets easier to forget the longer today goes on. */}
      {pending.map((o) => {
        const site = injuries.find((i) => i.id === o.injury_id);
        return (
          <div
            key={o.id}
            className="rounded-[var(--radius)] border px-3 py-2"
            style={{ borderColor: "var(--accent)", background: "var(--surface-2)" }}
          >
            <div className="text-[11px] font-semibold">
              {site?.label ?? "Site"} — how was it this morning?
            </div>
            <div className="text-[10px] text-text-dim">
              Yesterday you recorded{" "}
              {o.pain_during_0_10 != null ? `${o.pain_during_0_10}/10 during` : "discomfort"}.
            </div>
            <Scale
              value={null}
              disabled={!canWrite || busy}
              onPick={(n) =>
                run(async () => {
                  await write({
                    action: "set_next_morning",
                    observation_id: o.id,
                    pain_next_morning_0_10: n,
                  });
                })
              }
            />
          </div>
        );
      })}

      {tracked.map((injury) => {
        const observation = today.find((o) => o.injury_id === injury.id) ?? null;
        const open = openId === injury.id;
        return (
          <SiteRow
            key={injury.id}
            injury={injury}
            activities={activities}
            observation={observation}
            open={open}
            busy={busy}
            canWrite={canWrite}
            onToggle={() => setOpenId(open ? null : injury.id)}
            onSave={(patch) =>
              run(async () => {
                await write({
                  action: "save_body_observation",
                  injury_id: injury.id,
                  obs_date: date,
                  session_id: sessionId,
                  ...patch,
                });
                setOpenId(null);
              })
            }
            onClear={
              observation && observation.provenance === "logged"
                ? () =>
                    run(async () => {
                      await write({
                        action: "delete_body_observation",
                        observation_id: observation.id,
                      });
                      setOpenId(null);
                    })
                : undefined
            }
          />
        );
      })}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      <p className="text-[10px] leading-snug text-text-faint">
        A pattern, never a diagnosis. Nothing recorded here is compared with anything to
        conclude a cause, and a day without a reading stays a day without one.
      </p>
    </div>
  );
}

function SiteRow({
  injury,
  activities,
  observation,
  open,
  busy,
  canWrite,
  onToggle,
  onSave,
  onClear,
}: {
  injury: Injury;
  activities: ProvokingActivity[];
  observation: InjuryObservation | null;
  open: boolean;
  busy: boolean;
  canWrite: boolean;
  onToggle: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  onClear?: () => void;
}) {
  const [during, setDuring] = useState<number | null>(observation?.pain_during_0_10 ?? null);
  const [after, setAfter] = useState<number | null>(observation?.pain_after_0_10 ?? null);
  const [activity, setActivity] = useState<number | null>(
    observation?.provoking_activity_id ?? null,
  );
  const [notes, setNotes] = useState(observation?.notes ?? "");

  const summary = observation
    ? observation.pain_free
      ? "no pain"
      : [
          observation.pain_during_0_10 != null ? `${observation.pain_during_0_10} during` : null,
          observation.pain_after_0_10 != null ? `${observation.pain_after_0_10} after` : null,
          observation.pain_next_morning_0_10 != null
            ? `${observation.pain_next_morning_0_10} next morning`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || "recorded"
    : "not recorded";

  return (
    <div
      className="rounded-[var(--radius)] border"
      style={{ borderColor: open ? "var(--accent)" : "var(--border)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{injury.label}</span>
        <span
          className="shrink-0 text-[11px]"
          style={{
            color: observation
              ? observation.pain_free
                ? "var(--stood)"
                : "var(--text)"
              : "var(--text-faint)",
          }}
        >
          {summary}
        </span>
        <span className="shrink-0 text-text-faint" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          {injury.detail ? (
            <p className="text-[10px] leading-snug text-text-dim">{injury.detail}</p>
          ) : null}

          {/* Offered first and on its own. It is the reading most often
              skipped, and the one that makes the others legible. */}
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() => onSave({ pain_free: true })}
            className="min-h-[52px] w-full rounded-[var(--radius)] border text-sm font-bold disabled:opacity-40"
            style={{
              borderColor: "var(--stood)",
              color: "var(--stood)",
              background: observation?.pain_free ? "var(--stood-bg)" : "transparent",
            }}
          >
            {observation?.pain_free ? "✓ No pain today" : "No pain today"}
          </button>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-dim">
              During training {during == null ? "· not rated" : `· ${during}/10`}
            </div>
            <Scale value={during} disabled={!canWrite || busy} onPick={setDuring} />
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-text-dim">
              After {after == null ? "· not rated" : `· ${after}/10`}
            </div>
            <Scale value={after} disabled={!canWrite || busy} onPick={setAfter} />
          </div>

          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-wide text-text-dim">
              What brought it on
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activities.map((a) => {
                const on = activity === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={!canWrite || busy}
                    onClick={() => setActivity(on ? null : a.id)}
                    aria-pressed={on}
                    className="min-h-[34px] rounded-full border px-2.5 text-[11px] font-semibold disabled:opacity-40"
                    style={{
                      borderColor: on ? "var(--accent)" : "var(--border)",
                      color: on ? "var(--accent)" : "var(--text-dim)",
                    }}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>

          <textarea
            value={notes}
            disabled={!canWrite || busy}
            rows={2}
            placeholder="Where exactly, what it felt like, what you changed."
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-sm"
          />

          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canWrite || busy || (during == null && after == null && !notes.trim())}
              onClick={() =>
                onSave({
                  pain_free: false,
                  pain_during_0_10: during,
                  pain_after_0_10: after,
                  provoking_activity_id: activity,
                  notes: notes.trim() || null,
                })
              }
              className="min-h-[44px] flex-1 rounded-[var(--radius)] text-sm font-bold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              {busy ? "Saving…" : "Save reading"}
            </button>
            {onClear ? (
              <button
                type="button"
                disabled={busy}
                onClick={onClear}
                className="min-h-[44px] rounded-[var(--radius)] border border-border px-3 text-sm font-semibold"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 0–10, where 0 is a recorded nought and no selection is no reading. */
function Scale({
  value,
  disabled,
  onPick,
}: {
  value: number | null;
  disabled: boolean;
  onPick: (n: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 11 }, (_, n) => n).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onPick(n)}
          aria-label={`${n} out of 10`}
          aria-pressed={value === n}
          className="tnum h-9 flex-1 rounded-md border text-[11px] font-semibold disabled:opacity-40"
          style={{
            borderColor: value === n ? "var(--accent)" : "var(--border)",
            color: value === n ? "var(--accent)" : "var(--text-dim)",
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
