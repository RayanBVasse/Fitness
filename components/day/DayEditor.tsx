"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { Card, SectionTitle } from "@/components/ui";
import { DailyCheckIn } from "@/components/today/DailyCheckIn";
import { londonTime, longDate, weekdayName } from "@/lib/time";
import { SessionWorkArea } from "@/components/session/SessionWorkArea";
import {
  WORKSTREAM_LABELS,
  type AssistanceType,
  type CalisthenicsAttempt,
  type CalisthenicsEntry,
  type ContextNote,
  type DailyMetric,
  type DailyMetricDef,
  type DayRecord,
  type Exercise,
  type FailureMode,
  type HypertrophySet,
  type MuscleGroup,
  type MuscleRegion,
  type Session,
  type SessionBlock,
  type Skill,
  type SkillVariation,
  type SnatchAttempt,
  type SnatchBlock,
  type SnatchVariation,
  type WarmupLadder,
  type WeightPreset,
} from "@/lib/types";

/**
 * Any day, editable after the fact.
 *
 * The point is that context arrives late. You know you rested because you were
 * wrecked, or because it was pouring, long after the day itself — and those are
 * different facts, worth keeping apart, because only one of them belongs
 * anywhere near a fatigue question later.
 *
 * Status, reason, journal and sessions all live on this one screen, so a past
 * day can be completed without inventing a gym session to hang it from.
 *
 * A session on a past day opens the same work area as today's. A mis-tapped
 * rep is wrong whether you catch it at 07:00 or the next morning, and the
 * write path has never cared which date a session belongs to. The one thing
 * a past day does not offer is last-time prefill: "last time" relative to a
 * day in the past would fill the form with numbers lifted after it.
 */

type Props = {
  date: string;
  day: DayRecord | null;
  sessions: Session[];
  loggedCounts: Record<string, number>;
  metricDefs: DailyMetricDef[];
  metrics: DailyMetric[];
  lastMetricValues: (DailyMetric & { metric_date: string })[];
  blocks: SessionBlock[];
  snatchBlocks: SnatchBlock[];
  snatchAttempts: SnatchAttempt[];
  hypertrophySets: HypertrophySet[];
  calisthenicsEntries: CalisthenicsEntry[];
  calisthenicsAttempts: CalisthenicsAttempt[];
  notes: ContextNote[];
  presets: WeightPreset[];
  variations: SnatchVariation[];
  failureModes: FailureMode[];
  ladder: WarmupLadder | null;
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
  muscleRegions: MuscleRegion[];
  skills: Skill[];
  skillVariations: SkillVariation[];
  assistanceTypes: AssistanceType[];
  isToday: boolean;
};

export function DayEditor({
  date,
  day,
  sessions,
  loggedCounts,
  blocks,
  snatchBlocks,
  snatchAttempts,
  hypertrophySets,
  calisthenicsEntries,
  calisthenicsAttempts,
  notes,
  presets,
  variations,
  failureModes,
  ladder,
  exercises,
  muscleGroups,
  muscleRegions,
  skills,
  skillVariations,
  assistanceTypes,
  metricDefs,
  metrics,
  lastMetricValues,
  isToday,
}: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Which session is asking "are you sure", and about how many records.
  const [confirming, setConfirming] = useState<{ id: string; logged: number } | null>(null);

  const status = day?.status ?? "unlogged";
  const hasSessions = sessions.length > 0;
  const restDef = metricDefs.find((d) => d.slug === "rest_reason");
  const restReason = metrics.find((m) => m.metric === "rest_reason")?.value_text ?? "";

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

  return (
    <div className="space-y-4 pt-5">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-faint">
            {weekdayName(date)}
            {isToday ? " · today" : ""}
          </div>
          <h1 className="text-2xl font-bold leading-tight">{longDate(date)}</h1>
        </div>
        <Link href="/history" className="text-sm text-text-faint underline underline-offset-2">
          History
        </Link>
      </header>

      <Card>
        <SectionTitle>What was this day?</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <StatusButton
            label="Rest day"
            active={status === "rest"}
            disabled={busy || hasSessions}
            onClick={() => run(async () => {
              await write({ action: "set_day_status", date, status: "rest" });
            })}
          />
          <StatusButton
            label="Not recorded"
            active={status === "unlogged"}
            disabled={busy || hasSessions}
            onClick={() => run(async () => {
              await write({ action: "set_day_status", date, status: "unlogged" });
            })}
          />
        </div>
        {hasSessions ? (
          <p className="mt-2 text-[11px] leading-snug text-text-faint">
            This day has {sessions.length === 1 ? "a session" : `${sessions.length} sessions`} on
            it, so it counts as trained. Delete the session below to change that.
          </p>
        ) : (
          <p className="mt-2 text-[11px] leading-snug text-text-faint">
            A rest day is a fact about the day. Leaving it unrecorded says nothing either way,
            which is different.
          </p>
        )}

        {status === "rest" && restDef ? (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">
              {restDef.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {restDef.suggested_values.map((chip) => {
                const on = restReason.split(" · ").includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    disabled={busy}
                    onClick={() => run(async () => {
                      const parts = restReason ? restReason.split(" · ").filter(Boolean) : [];
                      const next = on ? parts.filter((p) => p !== chip) : [...parts, chip];
                      await write({
                        action: "save_check_in",
                        date,
                        metrics: [{ metric: "rest_reason", value_text: next.join(" · ") || null }],
                      });
                    })}
                    className="min-h-[36px] rounded-full border px-3 text-xs font-semibold disabled:opacity-40"
                    style={{
                      borderColor: on ? "var(--accent)" : "var(--border)",
                      color: on ? "var(--accent)" : "var(--text-dim)",
                    }}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
            {restDef.help ? (
              <p className="mt-1.5 text-[11px] leading-snug text-text-faint">{restDef.help}</p>
            ) : null}
          </div>
        ) : null}
      </Card>

      {hasSessions ? (
        <Card>
          <SectionTitle aside={`${sessions.length} visit${sessions.length === 1 ? "" : "s"}`}>
            Sessions
          </SectionTitle>
          <ul className="divide-y divide-border">
            {sessions.map((session, index) => {
              const logged = loggedCounts[session.id] ?? 0;
              return (
                <li key={session.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      Visit {index + 1}
                      {session.started_at ? (
                        <span className="ml-1 font-normal text-text-faint">
                          {londonTime(session.started_at)}
                        </span>
                      ) : null}
                    </div>
                    <div className="tnum text-[11px] text-text-faint">
                      {logged > 0 ? `${logged} record${logged === 1 ? "" : "s"} logged` : "nothing logged"}
                      {session.provenance !== "logged" ? " · reconstructed" : ""}
                    </div>
                  </div>
                  {confirming?.id === session.id ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(async () => {
                          await write({
                            action: "delete_session",
                            session_id: session.id,
                            discard_records: true,
                          });
                          setConfirming(null);
                        })}
                        className="min-h-[36px] rounded-[var(--radius)] px-3 text-xs font-bold"
                        style={{ background: "var(--missed)", color: "var(--surface)" }}
                      >
                        Discard {confirming.logged}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="min-h-[36px] rounded-[var(--radius)] border border-border px-2 text-xs font-semibold text-text-dim"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        logged > 0
                          ? setConfirming({ id: session.id, logged })
                          : run(async () => {
                              await write({ action: "delete_session", session_id: session.id });
                            })
                      }
                      className="min-h-[36px] shrink-0 rounded-[var(--radius)] border border-border px-3 text-xs font-semibold disabled:opacity-30"
                      style={{ color: "var(--missed)" }}
                    >
                      Delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-text-faint">
            Deleting a session with records asks first and names the count. Changing your mind
            about an empty session is routine; discarding logged training should be deliberate,
            but it should not be a dead end.
          </p>
        </Card>
      ) : null}

      {/* Each session in full, and editable, exactly as Today renders it. */}
      {sessions.map((session, index) => (
        <div key={session.id} className="space-y-4">
          {sessions.length > 1 ? (
            <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-text-dim">
              Visit {index + 1}
            </div>
          ) : null}
          <SessionWorkArea
            date={date}
            sessionId={session.id}
            gymId={session.gym_id}
            blocks={blocks.filter((b) => b.session_id === session.id)}
            snatchBlocks={snatchBlocks.filter((b) => b.session_id === session.id)}
            snatchAttempts={snatchAttempts.filter((a) =>
              snatchBlocks.some((b) => b.id === a.block_id && b.session_id === session.id),
            )}
            hypertrophySets={hypertrophySets.filter((h) => h.session_id === session.id)}
            calisthenicsEntries={calisthenicsEntries.filter((c) => c.session_id === session.id)}
            calisthenicsAttempts={calisthenicsAttempts.filter((a) =>
              calisthenicsEntries.some(
                (e) => e.id === a.entry_id && e.session_id === session.id,
              ),
            )}
            notes={notes}
            presets={presets}
            variations={variations}
            failureModes={failureModes}
            ladder={ladder}
            exercises={exercises}
            muscleGroups={muscleGroups}
            muscleRegions={muscleRegions}
            regionHint={null}
            skills={skills}
            skillVariations={skillVariations}
            assistanceTypes={assistanceTypes}
            // Always empty here. "Last time" is computed from the most
            // recent session overall, so on a past day it would offer numbers
            // lifted after it — a prefill that reads as a measurement of a
            // day it did not happen on. Today's screen keeps the prefills.
            lastExerciseSettings={[]}
            lastSkillSettings={[]}
            recentExerciseIds={[]}
            recentSkillVariationIds={[]}
            performanceTitle={isToday ? undefined : "That session"}
            canWrite
          />
        </div>
      ))}

      {metricDefs.length > 0 ? (
        <Card>
          {/* The same check-in as Today, pointed at this date. Context arrives
              late, and a rest day often has the most of it. */}
          <DailyCheckIn
            date={date}
            defs={metricDefs}
            saved={metrics}
            lastValues={lastMetricValues}
            canWrite={!busy}
          />
        </Card>
      ) : null}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      {isToday ? (
        <Link
          href="/"
          className="flex min-h-[48px] items-center justify-center rounded-[var(--radius)] border border-border text-sm font-semibold"
        >
          Open Today to log training
        </Link>
      ) : null}
    </div>
  );
}

function StatusButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="min-h-[52px] rounded-[var(--radius)] border text-sm font-semibold disabled:opacity-40"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        color: active ? "var(--accent)" : "var(--text)",
        background: active ? "var(--surface-2)" : "transparent",
      }}
    >
      {label}
    </button>
  );
}

export function TrainedBadge({ workstreams }: { workstreams: string[] }) {
  return (
    <span className="text-[11px] text-text-faint">
      {workstreams.map((w) => WORKSTREAM_LABELS[w as keyof typeof WORKSTREAM_LABELS] ?? w).join(", ")}
    </span>
  );
}
