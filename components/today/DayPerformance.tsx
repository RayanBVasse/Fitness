import { SectionTitle, mgColour, wsColour } from "@/components/ui";
import type {
  CalisthenicsAttempt,
  CalisthenicsEntry,
  Exercise,
  HypertrophySet,
  MuscleGroup,
  SnatchBlock,
  SnatchVariation,
} from "@/lib/types";

/**
 * The day so far, in the units each workstream is actually measured in.
 *
 * Deliberately three groups and no grand total. Snatch tonnage, hypertrophy
 * volume load and hold seconds are not the same quantity, and a single number
 * made by adding them would mean nothing at all.
 *
 * Everything here is counted from records that exist. A figure with no data
 * behind it is absent rather than zero, because zero is a measurement and
 * "not recorded" is not.
 */

type Props = {
  snatchBlocks: SnatchBlock[];
  hypertrophySets: HypertrophySet[];
  calisthenicsEntries: CalisthenicsEntry[];
  calisthenicsAttempts: CalisthenicsAttempt[];
  variations: SnatchVariation[];
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
  /** "Today so far" on today; a past day is not still happening. */
  title?: string;
};

const num = (value: unknown): number => (value == null ? 0 : Number(value));
const round = (value: number) => Math.round(value).toLocaleString("en-GB");

export function DayPerformance({
  snatchBlocks,
  hypertrophySets,
  calisthenicsEntries,
  calisthenicsAttempts,
  variations,
  exercises,
  muscleGroups,
  title = "Today so far",
}: Props) {
  if (
    snatchBlocks.length === 0 &&
    hypertrophySets.length === 0 &&
    calisthenicsEntries.length === 0
  ) {
    return null;
  }

  // --- snatch --------------------------------------------------------------
  // Pulls and bottom stands are not snatches. They carry tonnage, because the
  // bar was still lifted, but they never touch a success rate.
  const fullLift = new Set(
    variations.filter((v) => v.counts_as_full_lift).map((v) => v.id),
  );
  const counted = snatchBlocks.filter((b) => fullLift.has(b.variation_id));
  const attempts = counted.reduce((t, b) => t + num(b.attempts), 0);
  const stood = counted.reduce((t, b) => t + num(b.full_stand_successes), 0);
  const received = counted.reduce((t, b) => t + num(b.received_total), 0);
  const tonnage = (rows: SnatchBlock[]) =>
    rows.reduce((t, b) => t + num(b.weight_kg) * num(b.attempts), 0);
  const working = tonnage(snatchBlocks.filter((b) => !b.is_warmup));
  const warmup = tonnage(snatchBlocks.filter((b) => b.is_warmup));

  // --- hypertrophy ---------------------------------------------------------
  const volume = hypertrophySets.reduce((t, s) => t + num(s.volume_load_kg), 0);
  const byGroup = new Map<number | null, { sets: number; volume: number }>();
  for (const set of hypertrophySets) {
    const groupId = exercises.find((e) => e.id === set.exercise_id)?.muscle_group_id ?? null;
    const entry = byGroup.get(groupId) ?? { sets: 0, volume: 0 };
    entry.sets += 1;
    entry.volume += num(set.volume_load_kg);
    byGroup.set(groupId, entry);
  }

  // --- calisthenics --------------------------------------------------------
  // Counted from the attempt rows, which is where a logged entry keeps its
  // outcomes. Reading the entry's summary columns reported "no counts
  // recorded" for a session with eight attempts in it, because those columns
  // are only filled for the imported history — which is why each entry falls
  // back to them when it has no rows of its own.
  let skillAttempts = 0;
  let skillSuccesses = 0;
  const holds: number[] = [];
  for (const entry of calisthenicsEntries) {
    const rows = calisthenicsAttempts.filter((a) => a.entry_id === entry.id);
    if (rows.length > 0) {
      skillAttempts += rows.length;
      skillSuccesses += rows.filter((a) => a.succeeded).length;
      for (const row of rows) {
        if (row.succeeded && num(row.hold_seconds) > 0) holds.push(num(row.hold_seconds));
      }
    } else {
      skillAttempts += num(entry.attempts);
      skillSuccesses += num(entry.successful_attempts);
      if (num(entry.best_hold_seconds) > 0) holds.push(num(entry.best_hold_seconds));
    }
  }
  const bestHold = holds.length > 0 ? Math.max(...holds) : null;

  return (
    <div>
      <SectionTitle>{title}</SectionTitle>

      <div className="space-y-3">
        {snatchBlocks.length > 0 ? (
          <Group hue={wsColour("snatch")} name="Snatch">
            <Figure
              label="Stood"
              value={attempts > 0 ? `${stood}/${attempts}` : "—"}
              hint={attempts > 0 ? `${received} received` : "no counted attempts"}
            />
            <Figure label="Working" value={round(working)} hint="kg lifted" />
            <Figure
              label="Warm-up"
              value={warmup > 0 ? round(warmup) : "—"}
              hint={warmup > 0 ? "kg, kept apart" : "none flagged"}
            />
          </Group>
        ) : null}

        {hypertrophySets.length > 0 ? (
          <Group hue={wsColour("hypertrophy")} name="Hypertrophy">
            <Figure label="Sets" value={String(hypertrophySets.length)} />
            <Figure
              label="Volume"
              value={volume >= 1000 ? `${(volume / 1000).toFixed(1)}t` : round(volume)}
              hint={volume >= 1000 ? `${round(volume)} kg` : "kg"}
            />
            <div className="col-span-3 flex flex-wrap gap-1 pt-1">
              {[...byGroup.entries()]
                .sort((a, b) => b[1].volume - a[1].volume)
                .map(([groupId, entry]) => {
                  const group = muscleGroups.find((g) => g.id === groupId);
                  return (
                    <span
                      key={groupId ?? "none"}
                      className="tnum rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        borderColor: `color-mix(in oklab, ${mgColour(group?.slug)} 45%, transparent)`,
                        color: mgColour(group?.slug),
                      }}
                    >
                      {group?.name ?? "Unassigned"} {entry.sets}
                    </span>
                  );
                })}
            </div>
          </Group>
        ) : null}

        {calisthenicsEntries.length > 0 ? (
          <Group hue={wsColour("calisthenics")} name="Calisthenics">
            <Figure
              label="Successes"
              value={skillAttempts > 0 ? `${skillSuccesses}/${skillAttempts}` : "—"}
              hint={skillAttempts > 0 ? "across skills" : "no counts recorded"}
            />
            <Figure
              label="Best hold"
              value={bestHold !== null ? `${bestHold}s` : "—"}
              hint={bestHold !== null ? "one skill" : "none recorded"}
            />
            <Figure label="Skills" value={String(calisthenicsEntries.length)} hint="logged" />
          </Group>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-text-faint">
        Counted from what is recorded, not summed across workstreams — tonnage, volume load and
        hold seconds are different quantities. Success rates exclude anything that is not a full
        lift.
      </p>
    </div>
  );
}

function Group({
  hue,
  name,
  children,
}: {
  hue: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-[var(--radius)] border border-border"
      style={{ borderLeft: `4px solid ${hue}` }}
    >
      <div
        className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
        style={{
          color: hue,
          background: `color-mix(in oklab, ${hue} 10%, var(--surface))`,
        }}
      >
        {name}
      </div>
      <div className="grid grid-cols-3 gap-2 px-3 py-2">{children}</div>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-text-dim">{label}</div>
      <div className="tnum text-lg font-semibold leading-tight">{value}</div>
      {hint ? <div className="truncate text-[10px] text-text-dim">{hint}</div> : null}
    </div>
  );
}
