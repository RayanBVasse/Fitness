"use client";

import { useEffect, useState } from "react";
import { SnatchLogger } from "@/components/today/SnatchLogger";
import { HypertrophyLogger } from "@/components/today/HypertrophyLogger";
import { CalisthenicsLogger } from "@/components/today/CalisthenicsLogger";
import { DayNotes, type NoteSubject } from "@/components/today/DayNotes";
import { DayPerformance } from "@/components/today/DayPerformance";
import { Card, wsColour } from "@/components/ui";
import {
  WORKSTREAM_LABELS,
  type AssistanceType,
  type CalisthenicsAttempt,
  type CalisthenicsEntry,
  type ContextNote,
  type Exercise,
  type FailureMode,
  type HypertrophySet,
  type LastExerciseSetting,
  type LastSkillSetting,
  type MuscleGroup,
  type MuscleRegion,
  type SessionBlock,
  type Skill,
  type SkillVariation,
  type SnatchAttempt,
  type SnatchBlock,
  type SnatchVariation,
  type WarmupLadder,
  type WeightPreset,
  type Workstream,
} from "@/lib/types";

/**
 * One session's work area: three tabs, three loggers, the notes attached to
 * each, and the day's totals underneath.
 *
 * Shared between Today and any past date. A session is a session — correcting
 * a mis-tapped rep is the same operation whether you notice it at 07:00 or
 * the next morning, and the write path has never cared which day a session
 * belongs to. The only difference a past day makes is that it does not offer
 * last-time prefills, because "last time" relative to a day in the past would
 * mean filling a form with numbers lifted after it.
 */

export const WORKSTREAMS: Workstream[] = ["snatch", "hypertrophy", "calisthenics"];
const TAB_KEY = "fitness.workstream-tab";

type Props = {
  date: string;
  sessionId: string;
  gymId: number | null;
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
  regionHint: string | null;
  skills: Skill[];
  skillVariations: SkillVariation[];
  assistanceTypes: AssistanceType[];
  lastExerciseSettings: LastExerciseSetting[];
  lastSkillSettings: LastSkillSetting[];
  recentExerciseIds: number[];
  recentSkillVariationIds: number[];
  /** Null on a past day: see the note above about prefills. */
  initialTab?: Workstream | null;
  /**
   * The tab, when the page wants to own it — the scoreboard tiles above set
   * it, and the tile and the tab must not be able to drift apart. Left
   * undefined the work area keeps its own, as it always did.
   */
  tab?: Workstream;
  /** Fires on every change, including the one the remembered tab makes. */
  onTabChange?: (next: Workstream) => void;
  /** Omitted on today; a past day says what it was, not what it is. */
  performanceTitle?: string;
  canWrite: boolean;
};

export function SessionWorkArea({
  date,
  sessionId,
  gymId,
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
  regionHint,
  skills,
  skillVariations,
  assistanceTypes,
  lastExerciseSettings,
  lastSkillSettings,
  recentExerciseIds,
  recentSkillVariationIds,
  initialTab = null,
  tab: controlledTab,
  onTabChange,
  performanceTitle,
  canWrite,
}: Props) {
  const [ownTab, setOwnTab] = useState<Workstream>(initialTab ?? "snatch");
  const tab = controlledTab ?? ownTab;

  // Which tab you were on, remembered per browser. It is a view preference,
  // not a fact about training, so it has no business in Postgres.
  useEffect(() => {
    const stored = (() => {
      try {
        return window.localStorage.getItem(TAB_KEY);
      } catch {
        return null;
      }
    })();
    const remembered =
      stored && (WORKSTREAMS as string[]).includes(stored) ? (stored as Workstream) : null;
    const next = remembered ?? initialTab ?? null;
    // Browser storage cannot be read during render without a hydration
    // mismatch, since the server has no access to it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next) setOwnTab(next);
    // Told to the page as well, so a scoreboard above can light the tile
    // that matches the tab you were left on.
    if (next) onTabChange?.(next);
    // Deliberately once, on mount: after that the tab is yours.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseTab(next: Workstream) {
    setOwnTab(next);
    onTabChange?.(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      /* nothing to do: the tab simply will not be remembered */
    }
  }

  const snatchBlock = blocks.find((b) => b.workstream === "snatch") ?? null;
  const hypertrophyBlock = blocks.find((b) => b.workstream === "hypertrophy") ?? null;
  const calisthenicsBlock = blocks.find((b) => b.workstream === "calisthenics") ?? null;

  /** What each tab has to show for itself. Nothing recorded reads as a dash,
   *  not a zero: zero sets is a measurement, and this is an absence. */
  function tabTotal(workstream: Workstream): string {
    if (workstream === "snatch") {
      const lifts = snatchBlocks.reduce((total, b) => total + Number(b.attempts ?? 0), 0);
      return lifts > 0 ? `${lifts} attempt${lifts === 1 ? "" : "s"}` : "—";
    }
    if (workstream === "hypertrophy") {
      const n = hypertrophySets.length;
      return n > 0 ? `${n} set${n === 1 ? "" : "s"}` : "—";
    }
    const n = calisthenicsEntries.length;
    return n > 0 ? `${n} skill${n === 1 ? "" : "s"}` : "—";
  }

  const hue = wsColour(tab);

  /**
   * What each tab's notes can be about: the exercises and variations this
   * session has on record, in the order they were worked. Only what was
   * logged — a note about something you did not do today is a note about
   * something else, and offering the whole library would turn a tap into a
   * search.
   */
  const workedExercises: NoteSubject[] = [
    ...new Map(
      hypertrophySets.map((set) => [
        set.exercise_id,
        {
          kind: "exercise" as const,
          id: set.exercise_id,
          name: exercises.find((e) => e.id === set.exercise_id)?.name ?? "Exercise",
        },
      ]),
    ).values(),
  ];
  const workedSkills: NoteSubject[] = [
    ...new Map(
      calisthenicsEntries.map((entry) => [
        entry.skill_variation_id,
        {
          kind: "skill" as const,
          id: entry.skill_variation_id,
          name:
            skillVariations.find((v) => v.id === entry.skill_variation_id)?.name ?? "Skill",
        },
      ]),
    ).values(),
  ];

  return (
    <>
      {/* One work area, three tabs. Selecting a tab records nothing: the
          block for a workstream is created by its first set, lift or skill
          entry, server-side. The inactive panels stay mounted and are merely
          hidden, so a half-typed entry survives a switch. */}
      <Card
        style={{
          borderColor: `color-mix(in oklab, ${hue} 35%, var(--border))`,
          boxShadow: `inset 0 3px 0 ${hue}`,
        }}
      >
        {/* Three buttons, not a segmented control on a grey track. The
            active one is solid in its own colour and the other two sit in
            their tints, so the tab and the tile above it read as the same
            thing. */}
        <div role="tablist" aria-label="Workstream" className="mb-3 grid grid-cols-3 gap-2">
          {WORKSTREAMS.map((workstream) => {
            const on = tab === workstream;
            return (
              <button
                key={workstream}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => chooseTab(workstream)}
                className="flex h-[46px] flex-col items-center justify-center rounded-xl border px-1"
                style={
                  on
                    ? {
                        background: `var(--ws-${workstream})`,
                        borderColor: `var(--ws-${workstream})`,
                        color: "var(--accent-text)",
                      }
                    : {
                        background: `var(--ws-${workstream}-tint)`,
                        borderColor: `var(--ws-${workstream}-line)`,
                        color: `var(--ws-${workstream}-fg)`,
                      }
                }
              >
                <span className="block truncate text-[13px] font-extrabold">
                  {WORKSTREAM_LABELS[workstream]}
                </span>
                <span className="tnum block text-[10.5px] font-semibold">
                  {tabTotal(workstream)}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: tab === "snatch" ? undefined : "none" }}>
          {/* Keyed on the session: the logger seeds its state from these
              blocks on mount, so switching sessions must remount it rather
              than leave the previous one's blocks on screen. */}
          <SnatchLogger
            key={sessionId}
            sessionId={sessionId}
            sessionBlockId={snatchBlock?.id ?? null}
            presets={presets}
            variations={variations}
            ladder={ladder}
            initialBlocks={snatchBlocks}
            initialAttempts={snatchAttempts}
            failureModes={failureModes}
            canWrite={canWrite}
          />
          <div className="mt-3">
            <DayNotes
              composerOnly
              date={date}
              sessionId={sessionId}
              workstream="snatch"
              notes={notes}
              canWrite={canWrite}
            />
          </div>
        </div>

        <div style={{ display: tab === "hypertrophy" ? undefined : "none" }}>
          <HypertrophyLogger
            key={`h-${sessionId}`}
            sessionId={sessionId}
            sessionBlockId={hypertrophyBlock?.id ?? null}
            gymId={gymId}
            exercises={exercises}
            muscleGroups={muscleGroups}
            muscleRegions={muscleRegions}
            regionHint={regionHint}
            recentExerciseIds={recentExerciseIds}
            lastSettings={lastExerciseSettings}
            initialSets={hypertrophySets}
            canWrite={canWrite}
          />
          <div className="mt-3">
            <DayNotes
              composerOnly
              date={date}
              sessionId={sessionId}
              workstream="hypertrophy"
              notes={notes}
              subjects={workedExercises}
              canWrite={canWrite}
            />
          </div>
        </div>

        <div style={{ display: tab === "calisthenics" ? undefined : "none" }}>
          <CalisthenicsLogger
            key={`c-${sessionId}`}
            sessionId={sessionId}
            sessionBlockId={calisthenicsBlock?.id ?? null}
            skills={skills}
            variations={skillVariations}
            assistanceTypes={assistanceTypes}
            recentVariationIds={recentSkillVariationIds}
            lastSettings={lastSkillSettings}
            initialEntries={calisthenicsEntries}
            initialAttempts={calisthenicsAttempts}
            canWrite={canWrite}
          />
          <div className="mt-3">
            <DayNotes
              composerOnly
              date={date}
              sessionId={sessionId}
              workstream="calisthenics"
              notes={notes}
              subjects={workedSkills}
              canWrite={canWrite}
            />
          </div>
        </div>
      </Card>

      <Card>
        <DayPerformance
          snatchBlocks={snatchBlocks}
          hypertrophySets={hypertrophySets}
          calisthenicsEntries={calisthenicsEntries}
          calisthenicsAttempts={calisthenicsAttempts}
          variations={variations}
          exercises={exercises}
          muscleGroups={muscleGroups}
          title={performanceTitle}
        />
      </Card>
    </>
  );
}
