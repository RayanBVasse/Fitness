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
  // The check-in opens from the header instead of holding a card open
  // all day, and the tab is held here so the scoreboard tiles and the
  // logger cannot show different workstreams as the active one.
  const [checkInOpen, setCheckInOpen] = useState(false);
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
          {metricDefs.length > 0 ? (
            <div className="flex items-center gap-2">
              <span className="tnum text-[11px] text-text-dim">
                {metrics.length > 0
                  ? `${metrics.length} recorded`
                  : "Check-in not answered"}
              </span>
              <Chip size="sm" on={checkInOpen} onClick={() => setCheckInOpen((v) => !v)}>
                {checkInOpen ? "Close" : "Edit"}
              </Chip>
            </div>
          ) : null}

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

      {/* Opened from the header rather than sitting open all day. It still
          saves as you move a slider — you asked for no save button, and a
          dialog would have put one back. */}
      {checkInOpen && metricDefs.length > 0 ? (
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

          {/* The logger and the margin. Notes sit beside the work rather
              than under it, where a day's writing was easy to scroll past
              and easier to forget. */}
          <div className="grid grid-cols-1 items-start gap-3.5 min-[900px]:grid-cols-[1.45fr_1fr]">
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

          <aside
            className="p-3.5"
            style={{ background: "var(--margin-bg)", borderRadius: 14 }}
          >
            <DayNotes
              date={date}
              sessionId={session.id}
              notes={notes}
              canWrite={canWrite}
            />
          </aside>
          </div>
        </>
      )}

      {error ? (
        <p className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}

      {/* Without a session there is no margin to put them in, so the day's
          notes keep a card of their own. */}
      {!session ? (
        <Card>
          <DayNotes date={date} sessionId={null} notes={notes} canWrite={canWrite} />
        </Card>
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
          columns
          canWrite={canWrite}
        />
      </Card>

    </div>
  );
}
