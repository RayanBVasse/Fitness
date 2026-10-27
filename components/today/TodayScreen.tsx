"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { DailyCheckIn } from "@/components/today/DailyCheckIn";
import { DayNotes } from "@/components/today/DayNotes";
import { SessionWorkArea } from "@/components/session/SessionWorkArea";
import { Card, Chip, Pill, SectionTitle } from "@/components/ui";
import { isoWeekday, londonTime, longDate, weekdayName } from "@/lib/time";
import {
  WORKSTREAM_LABELS,
  type AssistanceType,
  type CalisthenicsAttempt,
  type CalisthenicsEntry,
  type ContextNote,
  type Exercise,
  type FailureMode,
  type Gym,
  type HypertrophySet,
  type LastExerciseSetting,
  type LastSkillSetting,
  type MuscleGroup,
  type MuscleRegion,
  type Skill,
  type SkillVariation,
  type Session,
  type SessionBlock,
  type SessionSummary,
  type SnatchAttempt,
  type SnatchBlock,
  type SnatchObjective,
  type DailyMetric,
  type DailyMetricDef,
  type DayRecord,
  type SnatchVariation,
  type WeekdayThemes,
  type WarmupLadder,
  type WeightPreset,
} from "@/lib/types";

type Props = {
  date: string;
  day: DayRecord | null;
  metricDefs: DailyMetricDef[];
  metrics: DailyMetric[];
  lastMetricValues: (DailyMetric & { metric_date: string })[];
  sessions: Session[];
  blocks: SessionBlock[];
  snatchBlocks: SnatchBlock[];
  snatchAttempts: SnatchAttempt[];
  hypertrophySets: HypertrophySet[];
  calisthenicsEntries: CalisthenicsEntry[];
  calisthenicsAttempts: CalisthenicsAttempt[];
  lastExerciseSettings: LastExerciseSetting[];
  lastSkillSettings: LastSkillSetting[];
  recentExerciseIds: number[];
  recentSkillVariationIds: number[];
  muscleGroups: MuscleGroup[];
  muscleRegions: MuscleRegion[];
  exercises: Exercise[];
  skills: Skill[];
  skillVariations: SkillVariation[];
  assistanceTypes: AssistanceType[];
  lastSession: SessionSummary | null;
  notes: ContextNote[];
  gyms: Gym[];
  failureModes: FailureMode[];
  presets: WeightPreset[];
  variations: SnatchVariation[];
  ladder: WarmupLadder | null;
  objective: SnatchObjective | null;
  weekdayThemes: WeekdayThemes;
};

export function TodayScreen({
  date,
  day,
  metricDefs,
  metrics,
  lastMetricValues,
  sessions,
  blocks,
  snatchBlocks,
  snatchAttempts,
  hypertrophySets,
  calisthenicsEntries,
  calisthenicsAttempts,
  lastExerciseSettings,
  lastSkillSettings,
  recentExerciseIds,
  recentSkillVariationIds,
  muscleGroups,
  muscleRegions,
  exercises,
  skills,
  skillVariations,
  assistanceTypes,
  lastSession,
  notes,
  gyms,
  failureModes,
  presets,
  variations,
  ladder,
  objective,
  weekdayThemes,
}: Props) {
  const router = useRouter();
  // Reaching this screen at all means the middleware accepted a session, so
  // there is nothing further to check before allowing a write.
  const canWrite = true;
  // You usually go back to the same gym, so that is the default rather than
  // a blank. Changing it is one tap.
  const theme = weekdayThemes[String(isoWeekday(date))] ?? null;
  // The region the day states. Falls back to reading it out of the emphasis,
  // for themes written before `region` had a field of its own.
  const regionHint = theme?.region ?? theme?.emphasis ?? null;

  const [gymId, setGymId] = useState<number | null>(
    () => gyms.find((g) => g.name === lastSession?.gym)?.id ?? null,
  );
  // Most days have one visit. When there are two, the latest is the one being
  // logged into, and the other stays reachable rather than hidden.
  const [activeId, setActiveId] = useState<string | null>(null);
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

  const session =
    sessions.find((s) => s.id === activeId) ?? sessions[sessions.length - 1] ?? null;
  const sessionBlocks = blocks.filter((b) => b.session_id === session?.id);
  const sessionSnatchBlocks = snatchBlocks.filter((b) => b.session_id === session?.id);
  const sessionHypertrophy = hypertrophySets.filter((h) => h.session_id === session?.id);
  const sessionCalisthenics = calisthenicsEntries.filter((c) => c.session_id === session?.id);

  return (
    <div className="space-y-4 pt-5">
      {/* Date, day and gym are shown rather than asked for. */}
      <header>
        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-faint">
          {weekdayName(date)}
        </div>
        <h1 className="text-2xl font-bold leading-tight">{longDate(date)}</h1>
        {theme ? (
          <p className="mt-0.5 text-sm">
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {theme.name}
            </span>
            {theme.emphasis ? (
              <span className="text-text-dim"> · {theme.emphasis}</span>
            ) : null}
          </p>
        ) : null}
      </header>

      {objective ? (
        <Card className="!p-3">
          <div className="text-[11px] uppercase tracking-wide text-text-faint">
            Current objective
          </div>
          <p className="mt-0.5 text-sm leading-snug">{objective.statement}</p>
          <div className="mt-2 flex gap-1.5">
            <Pill tone="accent">{objective.primary_load_kg} kg</Pill>
            <Pill tone="stood">target {objective.primary_target_stand_rate_pct}%</Pill>
            <Pill tone="caught">{objective.secondary_load_kg} kg not yet stood</Pill>
          </div>
        </Card>
      ) : null}

      {metricDefs.length > 0 ? (
        <Card>
          <DailyCheckIn
            date={date}
            defs={metricDefs}
            saved={metrics}
            lastValues={lastMetricValues}
            notes={notes}
            canWrite={canWrite}
          />
        </Card>
      ) : null}

      {!session && day?.status === "rest" ? (
        <Card>
          <SectionTitle>Rest day</SectionTitle>
          <p className="text-sm text-text-dim">
            Recorded as rest. That is a fact about today, not a gap in the record — it counts
            towards recovery intervals and training frequency.
          </p>
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() =>
              run(async () => {
                await write({ action: "set_day_status", date, status: "unlogged" });
              })
            }
            className="mt-3 min-h-[44px] w-full rounded-[var(--radius)] border border-border text-sm font-semibold disabled:opacity-40"
          >
            Undo rest day
          </button>
        </Card>
      ) : !session ? (
        <Card>
          <SectionTitle>No session today</SectionTitle>
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">
                Gym
              </div>
              <div className="grid grid-cols-2 gap-2">
                {gyms.map((gym) => (
                  <button
                    key={gym.id}
                    type="button"
                    onClick={() => setGymId(gym.id === gymId ? null : gym.id)}
                    aria-pressed={gymId === gym.id}
                    className="min-h-[42px] rounded-[var(--radius)] border px-2 text-sm font-semibold"
                    style={{
                      borderColor: gymId === gym.id ? "var(--accent)" : "var(--border)",
                      color: gymId === gym.id ? "var(--accent)" : "var(--text)",
                      background: "var(--surface-2)",
                    }}
                  >
                    {gym.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() =>
                run(async () => {
                  await write({
                    action: "start_session",
                    gym_id: gymId,
                    session_date: date,
                    started_at: new Date().toISOString(),
                  });
                })
              }
              className="min-h-[52px] w-full rounded-[var(--radius)] text-base font-bold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "var(--accent-text)" }}
            >
              Start session
            </button>

            {lastSession ? (
              <button
                type="button"
                disabled={!canWrite || busy}
                onClick={() =>
                  run(async () => {
                    await write<{ session: Session }>({
                      action: "start_session",
                      gym_id: lastSession.gym
                        ? (gyms.find((g) => g.name === lastSession.gym)?.id ?? null)
                        : null,
                      session_date: date,
                      started_at: new Date().toISOString(),
                    });
                    // The gym and the tab you land on, not the blocks. Copying
                    // blocks would make today claim yesterday's workstreams
                    // before anything had been recorded.
                    // The work area opens on the last visit's first
                    // workstream; nothing to set here.
                  })
                }
                className="min-h-[48px] w-full rounded-[var(--radius)] border border-border text-sm font-semibold disabled:opacity-40"
              >
                Repeat previous session
                <span className="ml-1 font-normal text-text-faint">
                  {lastSession.gym ?? "no gym"} ·{" "}
                  {(lastSession.workstreams ?? []).map((w) => WORKSTREAM_LABELS[w]).join(", ") ||
                    "no workstreams"}
                </span>
              </button>
            ) : null}

            {/* A rest day is data. Marking it is what makes "days since last
                heavy session" and "consecutive training days" trustworthy. */}
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={() =>
                run(async () => {
                  await write({ action: "set_day_status", date, status: "rest" });
                })
              }
              className="min-h-[44px] w-full rounded-[var(--radius)] border border-dashed border-border text-sm font-semibold text-text-dim disabled:opacity-40"
            >
              Mark today as a rest day
            </button>
          </div>
        </Card>
      ) : (
        <>
          <Card>
            {/* No clocks. Session times were never actually recorded, and
                showing them implied a precision that did not exist. */}
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">
                Gym
              </div>
              <div className="flex flex-wrap gap-1.5">
                {gyms.map((gym) => {
                  const on = session.gym_id === gym.id;
                  return (
                    <Chip
                      key={gym.id}
                      on={on}
                      disabled={!canWrite || busy}
                      onClick={() =>
                        run(async () => {
                          await write({
                            action: "update_session",
                            session_id: session.id,
                            gym_id: on ? null : gym.id,
                          });
                        })
                      }
                    >
                      {gym.name}
                    </Chip>
                  );
                })}
              </div>
            </div>

            {sessions.length > 1 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {sessions.map((s, index) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    aria-pressed={s.id === session?.id}
                    className="min-h-[36px] rounded-[var(--radius)] border px-3 text-xs font-semibold"
                    style={{
                      borderColor: s.id === session?.id ? "var(--accent)" : "var(--border)",
                      color: s.id === session?.id ? "var(--accent)" : "var(--text-dim)",
                    }}
                  >
                    Visit {index + 1}
                    {s.started_at ? ` · ${londonTime(s.started_at)}` : ""}
                  </button>
                ))}
              </div>
            ) : null}

          </Card>

          <SessionWorkArea
            date={date}
            sessionId={session.id}
            gymId={session.gym_id}
            blocks={sessionBlocks}
            snatchBlocks={sessionSnatchBlocks}
            snatchAttempts={snatchAttempts.filter((a) =>
              sessionSnatchBlocks.some((b) => b.id === a.block_id),
            )}
            hypertrophySets={sessionHypertrophy}
            calisthenicsEntries={sessionCalisthenics}
            calisthenicsAttempts={calisthenicsAttempts.filter((a) =>
              sessionCalisthenics.some((e) => e.id === a.entry_id),
            )}
            notes={notes}
            presets={presets}
            variations={variations}
            failureModes={failureModes}
            ladder={ladder}
            exercises={exercises}
            muscleGroups={muscleGroups}
            muscleRegions={muscleRegions}
            regionHint={regionHint}
            skills={skills}
            skillVariations={skillVariations}
            assistanceTypes={assistanceTypes}
            lastExerciseSettings={lastExerciseSettings}
            lastSkillSettings={lastSkillSettings}
            recentExerciseIds={recentExerciseIds}
            recentSkillVariationIds={recentSkillVariationIds}
            initialTab={theme?.focus ?? lastSession?.workstreams?.[0] ?? null}
            canWrite={canWrite}
          />
        </>
      )}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      {/* The day's own notes: the gym, the body, anything the Coach should
          know that is not attached to one workstream. These replaced the
          check-in's free-text dimensions, which lived in a table of
          measurements and were never measurements. */}
      <Card>
        <DayNotes
          date={date}
          sessionId={session?.id ?? null}
          notes={notes}
          canWrite={canWrite}
        />
      </Card>

    </div>
  );
}
