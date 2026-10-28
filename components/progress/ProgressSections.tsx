import { HypertrophyDrill } from "@/components/progress/HypertrophyDrill";
import { QualityDots } from "@/components/progress/QualityDots";
import { WeeklyBars } from "@/components/progress/WeeklyBars";
import {
  Card,
  InsufficientData,
  MIN_ATTEMPTS_FOR_RATE,
  SectionTitle,
  mgColour,
  wsColour,
} from "@/components/ui";
import type { ProgressData } from "@/lib/queries";
import type { MuscleGroup, MuscleRegion } from "@/lib/types";

/**
 * What the training did, by week.
 *
 * Every figure is counted from rows at request time. Nothing is stored, so
 * nothing can drift from the data — the same reason the stand rates on this
 * screen replaced a frozen baseline.
 *
 * Rates are not plotted. A stand rate from two attempts and one from twenty
 * draw the same height, and a line through them reads as a trend that is
 * mostly noise. The bars are attempts, with the stood portion filled: the
 * volume and the outcome in one mark, neither implying the other.
 */

/** "1 attempt" / "12 attempts" / "no attempts". Null is not zero elsewhere;
 *  here the count is derived from rows, so zero really is none. */
function plural(n: number, noun: string): string {
  if (n === 0) return `no ${noun}s`;
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Which hue family each muscle belongs to. The palette is built family-first
 * — every leg is a green, every back muscle a blue — so two muscles can be
 * different tokens and still the same colour to look at.
 */
const FAMILY: Record<string, string> = {
  chest: "red", shoulders: "red", triceps: "red",
  mid_back: "blue", lats: "blue", biceps: "blue",
  quads: "green", hamstrings: "green", glutes: "green", calves: "green",
  core: "yellow",
};

export function SnatchProgress({ data }: { data: ProgressData }) {
  const hue = wsColour("snatch");
  // The loads worth a chart each: the ones actually worked in the window.
  const loads = data.snatchByLoad
    .filter((l) => l.points.reduce((t, p) => t + p.attempts, 0) >= 3)
    .slice(-4);

  // Loads that have at least one rating. A load worked all month and never
  // rated gets no chart rather than an empty one: the absence belongs in the
  // footnote, not in a row of blank axes.
  const rated = data.snatchQuality.filter((q) => q.rated > 0);

  const totals = loads.map((l) => ({
    load: l.load_kg,
    attempts: l.points.reduce((t, p) => t + p.attempts, 0),
    stood: l.points.reduce((t, p) => t + p.stood, 0),
  }));

  return (
    <Card
      style={{
        borderColor: `color-mix(in oklab, ${hue} 35%, var(--border))`,
        boxShadow: `inset 0 3px 0 ${hue}`,
      }}
    >
      <SectionTitle tone={hue} aside={plural(data.counts.snatchAttempts, "attempt")}>
        Snatch
      </SectionTitle>

      {loads.length === 0 ? (
        <InsufficientData reason="No substantiated full lifts in this window. A block counts only when it recorded both attempts and stands." />
      ) : (
        <div className="space-y-4">
          {loads.map((l) => (
              <WeeklyBars
                key={l.load_kg}
                title={`${l.load_kg} kg`}
                hue={hue}
                partLabel="stood"
                unit="count"
                bars={l.points.map((p) => ({
                  week: p.week,
                  value: p.attempts,
                  part: p.stood,
                }))}
              />
          ))}

          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
            {totals.map((t) => (
              <div key={t.load}>
                <div className="text-[10px] uppercase tracking-wide text-text-dim">
                  {t.load} kg
                </div>
                <div className="tnum text-lg font-semibold leading-tight">
                  {t.stood}/{t.attempts}
                </div>
                <div className="text-[10px] text-text-dim">
                  {t.attempts >= MIN_ATTEMPTS_FOR_RATE
                    ? `${Math.round((100 * t.stood) / t.attempts)}% stood`
                    : `too few for a rate`}
                </div>
              </div>
            ))}
          </div>

          <WeeklyBars
            title="Bar lifted"
            hue={hue}
            partLabel="working"
            unit="kg"
            bars={data.snatchTonnage.map((t) => ({
              week: t.week,
              value: t.working + t.warmup,
              part: t.working,
            }))}
          />
          <p className="text-[11px] leading-snug text-text-dim">
            The filled part is working weight; the rest is warm-up, and only where a block was
            flagged as one. Pulls and bottom stands carry tonnage but never appear in a stand
            count.
          </p>

          {/* Quality against load: whether the lighter lifts are becoming
              smooth while the heavy ones stay variable. This is the one
              reading that shows development without a new best lift, so it
              is its own section rather than a note under the rates. */}
          {rated.length > 0 ? (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
                Technical quality by load
              </p>
              {rated.map((q) => (
                <QualityDots
                  key={q.load_kg}
                  title={`${q.load_kg} kg`}
                  hue={hue}
                  weeks={q.points}
                  blocks={q.blocks}
                  rated={q.rated}
                />
              ))}
              <p className="text-[11px] leading-snug text-text-dim">
                Every rating, never averaged: the middle of three opinions is not a
                measurement. Read the dots gathering rather than rising — 7, 7, 7 and 4, 7, 10
                share an average and only one of them is consolidation. Full lifts you logged
                yourself; warm-ups and other variations are not mixed in.
                {data.snatchQualityImported > 0
                  ? ` ${data.snatchQualityImported} rated block${
                      data.snatchQualityImported === 1 ? "" : "s"
                    } from the imported reconstruction ${
                      data.snatchQualityImported === 1 ? "is" : "are"
                    } left out.`
                  : ""}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

export function HypertrophyProgress({
  data,
  regions,
  muscleGroups,
}: {
  data: ProgressData;
  regions: MuscleRegion[];
  muscleGroups: MuscleGroup[];
}) {
  const hue = wsColour("hypertrophy");
  const weeks = data.setsByGroup;

  // One chart per region, each a single hue. Stacking these would put a red
  // segment against a green one, which a deutan reader cannot separate.
  //
  // The hue is the first of the region's muscles whose FAMILY no earlier
  // region has taken. Chest and shoulders are both reds, so picking each
  // region's first muscle gave Chest & biceps and Shoulders & core the same
  // colour — two charts that look like the same thing.
  const takenFamilies = new Set<string>();
  const perRegion = regions
    .map((region) => {
      const slug =
        region.groups.find((g) => !takenFamilies.has(FAMILY[g] ?? g)) ?? region.groups[0];
      takenFamilies.add(FAMILY[slug] ?? slug);
      return {
        region,
        hue: mgColour(slug),
        bars: weeks.map((w) => ({
          week: w.week,
          value: region.groups.reduce((t, g) => t + (w.groups[g] ?? 0), 0),
        })),
      };
    })
    .filter((r) => r.bars.some((b) => b.value > 0));

  return (
    <Card
      style={{
        borderColor: `color-mix(in oklab, ${hue} 35%, var(--border))`,
        boxShadow: `inset 0 3px 0 ${hue}`,
      }}
    >
      <SectionTitle tone={hue} aside={plural(data.counts.hypertrophySets, "set")}>
        Hypertrophy
      </SectionTitle>

      {weeks.length === 0 ? (
        <InsufficientData reason="No sets logged in this window." />
      ) : (
        <div className="space-y-4">
          <WeeklyBars
            title="Volume load"
            hue={hue}
            unit="kg"
            bars={data.volumeByWeek}
          />

          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
              Sets per week
            </p>
            {perRegion.map(({ region, hue: regionHue, bars }) => (
              <WeeklyBars
                key={region.slug}
                title={region.name}
                hue={regionHue}
                unit="sets"
                bars={bars}
              />
            ))}
          </div>

          <p className="text-[11px] leading-snug text-text-dim">
            Volume load is weight × reps summed, a measure of work done and not of muscle
            gained. Loads are not comparable across gyms or machines, so a rise here can be a
            change of equipment.
          </p>

          {/* Where that caveat gets answered: the same totals, taken apart by
              muscle and by the machine they were lifted on. */}
          <HypertrophyDrill
            regions={regions}
            muscleGroups={muscleGroups}
            detail={data.hypertrophyDetail}
          />
        </div>
      )}
    </Card>
  );
}

export function CalisthenicsProgress({ data }: { data: ProgressData }) {
  const hue = wsColour("calisthenics");
  const skills = data.skills.filter((s) => s.attempts > 0);

  return (
    <Card
      style={{
        borderColor: `color-mix(in oklab, ${hue} 35%, var(--border))`,
        boxShadow: `inset 0 3px 0 ${hue}`,
      }}
    >
      <SectionTitle tone={hue} aside={plural(data.counts.calisthenicsAttempts, "attempt")}>
        Calisthenics
      </SectionTitle>

      {skills.length === 0 ? (
        <InsufficientData reason="No skill attempts in this window." />
      ) : (
        <>
          <ul className="space-y-1.5">
            {skills.map((s) => (
              <li
                key={s.variation}
                className="flex items-baseline gap-2 rounded-[var(--radius)] px-2 py-1.5"
                style={{ background: `color-mix(in oklab, ${hue} 6%, var(--surface-2))` }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.variation}</span>
                  <span className="text-[10px] text-text-dim">
                    {s.skill}
                    {s.difficulty != null ? ` · level ${s.difficulty}` : ""}
                    {s.basis !== "attempt" ? " · from block totals" : ""}
                  </span>
                </span>
                <span className="tnum shrink-0 text-right">
                  <span className="block text-sm font-semibold">
                    {s.successes}/{s.attempts}
                  </span>
                  <span className="block text-[10px] text-text-dim">
                    {s.bestHoldSeconds != null ? `longest ${s.bestHoldSeconds}s` : "no hold"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-text-dim">
            Per variation, never pooled. A banded push-up and a freestanding one are different
            capabilities that share a name, and one rate across them would describe neither.
          </p>
        </>
      )}
    </Card>
  );
}
