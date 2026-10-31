"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { write } from "@/lib/write";
import { DailyCheckIn } from "@/components/today/DailyCheckIn";
import { DayNotes } from "@/components/today/DayNotes";
import { CoachReviewPanel } from "@/components/notes/CoachReviewPanel";
import { SessionWorkArea } from "@/components/session/SessionWorkArea";
import { Card, SectionTitle } from "@/components/ui";
import { Chip, StickyNote, gymColour } from "@/components/design";
import { Scoreboard } from "@/components/today/Scoreboard";
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
  type CoachReview,
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
  type Workstream,
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
  /** The coach's review of today, pasted in from outside. */
  review: CoachReview | null;
  /** Already formatted: a timestamp parsed in the browser risks a mismatch. */
  reviewSavedAt: string | null;
  /** The day's facts, composed and redacted on the server, ready to copy. */
  brief: string;
  gyms: Gym[];
  failureModes: FailureMode[];
  presets: WeightPreset[];
  variations: SnatchVariation[];
  ladder: WarmupLadder | null;
  objective: SnatchObjective | null;
  /** Logged stands at the objective's load, all time. Null if none. */
  objectiveRate: { stood: number; attempts: number } | null;
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
  review,
  reviewSavedAt,
  brief,
  gyms,
  failureModes,
  presets,
  variations,
  ladder,
  objective,
  objectiveRate,
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
  // The tab is held here so the scoreboard tiles and the logger cannot
  // show different workstreams as the active one.
  const [tab, setTab] = useState<Workstream | null>(null);
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
    <div className="mx-auto max-w-[1120px] space-y-3.5 pt-5">
      {/* One row. The date on the left, and on the right the two things
          that used to be whole cards: what the check-in holds, and where
          you are. Neither is worth a card of its own on a day's screen. */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-faint">
            {weekdayName(date)}
          </div>
          <h1 className="text-[26px] font-extrabold leading-tight">{longDate(date)}</h1>
          {theme ? (
            <p className="mt-0.5 text-sm">
              <span className="font-semibold" style={{ color: "var(--accent)" }}>
                {theme.name}
              </span>
              {theme.emphasis ? <span className="text-text-dim"> · {theme.emphasis}</span> : null}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* The only gym control. With a session open it records where you
              are; without one it is the gym the next session will start at.
              It used to do the second thing only, while a card further down
              quietly did the first. */}
          {gyms.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {gyms.map((gym) => {
                const on = session ? session.gym_id === gym.id : gymId === gym.id;
                return (
                  <Chip
                    key={gym.id}
                    size="sm"
                    tone={gymColour(gym.id)}
                    on={on}
                    disabled={!canWrite || busy}
                    onClick={() => {
                      if (!session) {
                        setGymId(on ? null : gym.id);
                        return;
                      }
                      run(async () => {
                        await write({
                          action: "update_session",
                          session_id: session.id,
                          gym_id: on ? null : gym.id,
                        });
                      });
                    }}
                  >
                    {gym.name}
                  </Chip>
                );
              })}
            </div>
          ) : null}
        </div>
      </header>

      {/* Open. Sleep and soreness are answered once, early, and a control
          that hides the question is a control that postpones it. It saves
          as you tap — no save button, and no dialog to put one back. */}
      {metricDefs.length > 0 ? (
        <Card>
          <DailyCheckIn
            date={date}
            defs={metricDefs}
            saved={metrics}
            lastValues={lastMetricValues}
            canWrite={canWrite}
          />
        </Card>
      ) : null}

      <Card>
        <DayNotes
          key={date}
          date={date}
          sessionId={session?.id ?? null}
          notes={notes}
          allWorkstreams
          subjects={[
            ...exercises.filter((e) => hypertrophySets.some((row) => row.exercise_id === e.id) || notes.some((n) => n.exercise_id === e.id)).map((e) => ({ kind: "exercise" as const, id: e.id, name: e.name })),
            ...skillVariations.filter((s) => calisthenicsEntries.some((row) => row.skill_variation_id === s.id) || notes.some((n) => n.skill_variation_id === s.id)).map((s) => ({ kind: "skill" as const, id: s.id, name: s.name })),
          ]}
          canWrite={canWrite}
        />
      </Card>

      {session ? (
        <Scoreboard
          objective={objective}
          objectiveRate={objectiveRate}
          snatchBlocks={sessionSnatchBlocks}
          snatchAttempts={snatchAttempts}
          hypertrophySets={sessionHypertrophy}
          calisthenicsEntries={sessionCalisthenics}
          calisthenicsAttempts={calisthenicsAttempts}
          variations={variations}
          exercises={exercises}
          muscleGroups={muscleGroups}
          skillVariations={skillVariations}
          active={tab}
          onSelect={setTab}
        />
      ) : objective ? (
        <StickyNote label="Objective">{objective.statement}</StickyNote>
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
          {/* The gym grid that used to sit here is gone: the header chips
              choose it, and two controls for one fact drift apart. What the
              header has chosen is restated, because Start session acts on
              it and a silent default is the wrong kind of quiet. */}
          <SectionTitle
            aside={
              gymId === null
                ? "No gym chosen"
                : `Starts at ${gyms.find((g) => g.id === gymId)?.name ?? "the chosen gym"}`
            }
          >
            No session today
          </SectionTitle>

          <div className="flex flex-wrap items-stretch gap-2">
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
              className="min-h-[44px] flex-1 basis-[170px] rounded-[var(--radius)] px-4 text-sm font-bold disabled:opacity-40"
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
                  })
                }
                className="min-h-[44px] flex-1 basis-[170px] rounded-[var(--radius)] border border-border px-4 text-sm font-semibold disabled:opacity-40"
              >
                Repeat previous
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
              className="min-h-[44px] flex-1 basis-[150px] rounded-[var(--radius)] border border-dashed border-border px-4 text-sm font-semibold text-text-dim disabled:opacity-40"
            >
              Mark as rest day
            </button>
          </div>

          {/* What Repeat would actually do. It was a subtitle inside the
              button, which is what made the button tall. */}
          {lastSession ? (
            <p className="mt-2 text-[11px] leading-snug text-text-faint">
              Repeat opens a session at {lastSession.gym ?? "no gym"} ·{" "}
              {(lastSession.workstreams ?? []).map((w) => WORKSTREAM_LABELS[w]).join(", ") ||
                "no workstreams"}
              . It carries the gym over, not the sets.
            </p>
          ) : null}
        </Card>
      ) : (
        <>
          {/* Only when the day holds more than one visit. The gym moved to
              the header, and a card with nothing else in it is a box drawn
              around an empty space. No clocks beyond the start: session
              times were never really recorded, and showing them implied a
              precision that did not exist. */}
          {sessions.length > 1 ? (
            <Card>
              <div className="flex flex-wrap gap-2">
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
            </Card>
          ) : null}

          {/* Saved notes live once, in the day-wide section above. */}
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
            tab={tab ?? undefined}
            onTabChange={setTab}
            canWrite={canWrite}
          />

        </>
      )}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      {/* Last on the page, because it is the last thing that happens: the
          day's facts go out to the coach, and the coach's reading comes
          back. Kept clear of the notes above — those are yours. */}
      <Card>
        <CoachReviewPanel
          scope="day"
          periodKey={date}
          label={longDate(date)}
          content={review?.content ?? null}
          updatedAt={reviewSavedAt}
          brief={brief}
          canWrite={canWrite}
        />
      </Card>

    </div>
  );
}
