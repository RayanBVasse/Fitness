import Link from "next/link";
import { getDailyProgress } from "@/lib/dailyProgressQuery";
import { SevenDayProgress } from "@/components/progress/SevenDayProgress";
import { MonthlyProgress } from "@/components/progress/MonthlyProgress";
import { getMonthlyProgress } from "@/lib/monthlyProgressQuery";
import { resolveMonth } from "@/lib/monthDates";
import {
  getExperiments,
  getProgress,
  getReferenceData,
  getSnatchSuccessBySource,
  readReview,
} from "@/lib/queries";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, InsufficientData, MIN_ATTEMPTS_FOR_RATE, SectionTitle } from "@/components/ui";
import { CoachReviewPanel } from "@/components/notes/CoachReviewPanel";
import { Coverage } from "@/components/progress/Coverage";
import { ExperimentRegister } from "@/components/progress/ExperimentRegister";
import { londonTime, londonToday, longDate } from "@/lib/time";
import { composeWeekBrief } from "@/lib/weekBrief";
import { getWeekFacts } from "@/lib/weekFacts";
import { composeMonthBrief } from "@/lib/monthBrief";
import { getMonthFacts, previousMonth } from "@/lib/monthFacts";
import {
  BodyProgress,
  CalisthenicsProgress,
  HypertrophyProgress,
  SnatchProgress,
} from "@/components/progress/ProgressSections";

export const dynamic = "force-dynamic";

/**
 * Imported history and newly logged training are shown side by side and never
 * averaged. A single blended figure would bury each new session in ten months
 * of reconstruction, which is the opposite of what this screen is for.
 *
 * Nothing here is stored: every figure is computed from the rows, so it cannot
 * drift from the data the way a frozen baseline did.
 */
/**
 * Months are 183 and 365 days rather than calendar months. A window is a
 * length of time to look back over, not a position in the calendar, and
 * "6 months" meaning a different number of days depending on when you ask
 * would make two readings of the same screen incomparable.
 */
const PERIODS: { slug: string; label: string; days: number | null }[] = [
  { slug: "7d", label: "7 days", days: 7 },
  { slug: "month", label: "Monthly", days: 30 },
  { slug: "30d", label: "30 days", days: 30 },
  { slug: "90d", label: "90 days", days: 90 },
  { slug: "6m", label: "6 months", days: 183 },
  { slug: "12m", label: "12 months", days: 365 },
  { slug: "all", label: "All", days: null },
];

/** Below this, a chart over weeks is a handful of bars, not a trend. */
const MIN_WEEKS_FOR_TREND = 3;

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; month?: string }>;
}) {
  const { period: periodParam, month: monthParam } = await searchParams;
  const period = PERIODS.find((p) => p.slug === periodParam) ?? PERIODS[1];
  const today = londonToday();
  const selectedMonth = resolveMonth(monthParam, today);

  const [{ data, error }, reference, progress, experiments] = await Promise.all([
    getSnatchSuccessBySource(),
    getReferenceData(),
    getProgress(period.days),
    getExperiments(),
  ]);
  if (error) return <SetupNotice error={error} />;
  const daily = period.days === 7
    ? await getDailyProgress(londonToday(), reference.variations.filter(v => v.counts_as_full_lift).map(v => v.id))
    : null;
  if (daily?.error || (daily && reference.error)) return <SetupNotice error={daily?.error ?? reference.error!} />;
  const monthDashboard = period.slug === "month"
    ? await getMonthlyProgress(selectedMonth, today, reference.variations.filter(v => v.counts_as_full_lift).map(v => v.id))
    : null;
  if (monthDashboard?.error || (monthDashboard && reference.error)) return <SetupNotice error={monthDashboard?.error ?? reference.error!} />;

  const rows = data ?? [];
  const objective = reference.objective;
  const weights = [...new Set(rows.map((r) => Number(r.weight_kg)))].sort((a, b) => a - b);
  const at = (weight: number, source: "imported" | "logged") =>
    rows.find((r) => Number(r.weight_kg) === weight && r.source === source) ?? null;

  // A facts block for the two weeks you would actually be writing about: the
  // one in progress and the one that has just finished. The rest are archive
  // — their review is already written, and composing a brief for every week
  // in a twelve-month window would be a query per week.
  const briefs = new Map(
    await Promise.all(
      (monthDashboard ? [] : progress.weeklyReviews.slice(0, 2)).map(async ({ week }) => {
        const facts = await getWeekFacts(week);
        return [week, composeWeekBrief(facts, reference.thirdParties).text] as const;
      }),
    ),
  );

  // The month in progress and the one before it, which is the pair you
  // would be writing about. A monthly review is written looking back, so
  // the finished month matters more than the one underway.
  const thisMonth = monthDashboard ? selectedMonth : today.slice(0, 7);
  const months = [thisMonth, previousMonth(thisMonth)];
  const monthly = await Promise.all(
    months.map(async (month) => {
      const facts = await getMonthFacts(month);
      return {
        month,
        label: facts.label,
        brief: composeMonthBrief(facts, reference.thirdParties).text,
        review: await readReview("month", month),
      };
    }),
  );

  const counts = progress.counts;
  const primary = objective?.primary_load_kg ?? 50;
  const primaryImported = at(primary, "imported");
  const primaryLogged = at(primary, "logged");

  return (
    <div className="space-y-4 pt-5">
      <header>
        <h1 className="text-2xl font-bold">Progress</h1>
        <p className="text-sm text-text-dim">
          {daily || monthDashboard ? "Performance in the context of training load and recovery." : "Substantiated blocks only — those recording both attempts and stands."}
        </p>
      </header>

      {/* What the window actually holds, before any chart is read. "All" is
          named by its earliest record rather than by 1970, which is where the
          query starts and not where the training does. */}
      {!daily && !monthDashboard ? <p className="text-[11px] leading-snug text-text-faint">
        {counts.daysWithRecords === 0 ? (
          <>Nothing recorded in the last {period.label.toLowerCase()}.</>
        ) : (
          <>
            {period.days === null && progress.coveredFrom
              ? `Everything since ${longDate(progress.coveredFrom)}`
              : `The last ${period.label.toLowerCase()}`}
            {" · "}
            <span className="tnum">{counts.daysWithRecords}</span> day
            {counts.daysWithRecords === 1 ? "" : "s"} with records across{" "}
            <span className="tnum">{counts.weeksWithRecords}</span> week
            {counts.weeksWithRecords === 1 ? "" : "s"}.
            {counts.weeksWithRecords < MIN_WEEKS_FOR_TREND
              ? " Too few weeks for any of the charts below to show a trend; read them as what happened, not as a direction."
              : ""}
          </>
        )}
      </p> : null}

      {/* The window every chart below is drawn over. A link rather than a
          control, so the page stays server-rendered and a period is a place
          you can return to. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Period">
        {PERIODS.map((p) => {
          const on = p.slug === period.slug;
          return (
            <Link
              key={p.slug}
              href={`/progress?period=${p.slug}`}
              aria-current={on ? "true" : undefined}
              className="min-h-[38px] rounded-full border px-3 text-xs font-semibold leading-[34px]"
              style={{
                borderColor: on ? "var(--accent)" : "var(--border)",
                color: on ? "var(--accent)" : "var(--text-dim)",
                background: on ? "color-mix(in oklab, var(--accent) 8%, transparent)" : "transparent",
              }}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      {/* Two columns from `lg`. The panels are the page and each one is
          tall, so side by side they halve the scroll without squeezing a
          chart: a 540px column is wider than the whole app used to be.
          items-start keeps a short card from stretching to match a tall
          neighbour, and the wide things below span both. */}
      {daily ? <SevenDayProgress
        data={daily.data}
        attempts={daily.attempts}
        exercises={reference.exercises}
        gyms={reference.gyms}
        variations={reference.skillVariations}
        assistance={reference.assistanceTypes}
        muscleGroups={reference.muscleGroups}
        regions={reference.muscleRegions}
      /> : null}

      {monthDashboard ? <MonthlyProgress key={selectedMonth} data={monthDashboard.data} today={today}
        exercises={reference.exercises} gyms={reference.gyms} variations={reference.skillVariations} assistance={reference.assistanceTypes}
      /> : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {!daily && !monthDashboard ? <>
        <SnatchProgress data={progress} />
        <HypertrophyProgress
          data={progress}
          regions={reference.muscleRegions}
          muscleGroups={reference.muscleGroups}
        />
        <CalisthenicsProgress data={progress} />
        <BodyProgress data={progress} />
        </> : null}

        {/* After the charts, because it explains them: a month that looks
            quiet above is usually a month written down differently. Kept to
            one column — stretched across the page the month sits at one edge
            and its counts at the other, which is a long way for an eye to
            carry four numbers. */}
        {!daily && !monthDashboard ? <Coverage data={progress} /> : null}

        {!daily && !monthDashboard && objective ? (
          <Card>
            <SectionTitle>Primary objective</SectionTitle>
          <p className="text-sm leading-snug">{objective.statement}</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Figure
              label="Imported"
              value={primaryImported?.stand_rate_pct}
              n={primaryImported?.attempts}
              hint={primaryImported ? `${primaryImported.attempts} attempts` : "no history"}
            />
            <Figure
              label="Logged since"
              value={primaryLogged?.stand_rate_pct}
              n={primaryLogged?.attempts}
              hint={primaryLogged ? `${primaryLogged.attempts} attempts` : "none yet"}
            />
            <Figure label="Target" value={objective.primary_target_stand_rate_pct} hint="stand rate" />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-text-faint">
            Imported is the Jan–Oct 2026 reconstruction at {primary} kg. It is a starting point,
            never merged with what you log from here.
          </p>
          </Card>
        ) : null}

        {!daily && !monthDashboard ? <Card>
          <SectionTitle aside="stand / receive">By load</SectionTitle>
        {rows.length === 0 ? (
          <InsufficientData reason="No substantiated snatch blocks yet. Rates appear once a block records both attempts and stands." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-faint">
                <th className="pb-2 font-bold">Load</th>
                <th className="pb-2 text-right font-bold">Imported</th>
                <th className="pb-2 text-right font-bold">Logged</th>
                <th className="pb-2 text-right font-bold">Receive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {weights.map((weight) => {
                const imported = at(weight, "imported");
                const logged = at(weight, "logged");
                const receive = logged ?? imported;
                return (
                  <tr key={weight} className="tnum">
                    <td className="py-2 font-semibold">{weight} kg</td>
                    <td className="py-2 text-right text-text-dim">
                      <Rate
                        pct={imported?.stand_rate_pct}
                        stood={imported?.stood}
                        n={imported?.attempts}
                      />
                    </td>
                    <td className="py-2 text-right font-semibold">
                      <Rate pct={logged?.stand_rate_pct} stood={logged?.stood} n={logged?.attempts} />
                    </td>
                    <td className="py-2 text-right" style={{ color: "var(--caught)" }}>
                      {receive && (receive.attempts ?? 0) >= MIN_ATTEMPTS_FOR_RATE &&
                      receive.receive_rate_pct != null
                        ? `${receive.receive_rate_pct}%`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] leading-snug text-text-faint">
          Receiving the bar and standing it up are different capabilities. A high receive rate
          with a low stand rate means the catch is no longer the limiter. Percentages appear
          only from {MIN_ATTEMPTS_FOR_RATE} attempts; below that the counts are shown and the
          rate is not, because one lift either way would move it by twenty points.
          </p>
        </Card> : null}

        {/* Beside the reviews, because that is where these come from: an
            outside reader proposes something, and this is where it stops
            being a sentence in a conversation. A column, not the page: a
            text field run to 1100px is harder to write in, not easier. */}
        <Card>
          <ExperimentRegister experiments={experiments} today={londonToday()} />
        </Card>

        {/* The weekly reviews touching this window, newest first. The
            current week always appears, empty or not, so there is somewhere
            to paste one; the rest are the archive, each still editable. No
            facts block yet — a week's brief is not seven days concatenated,
            and inventing one here would make it look like the app had
            computed the week. */}
        {/* The monthly review, above the weeks it covers. */}
        {monthly.map((m) => (
          <Card key={m.month} className="lg:col-span-2">
            <CoachReviewPanel
              scope="month"
              periodKey={m.month}
              label={m.label}
              content={m.review?.content ?? null}
              updatedAt={m.review ? londonTime(m.review.updated_at) : null}
              brief={m.brief}
              canWrite
            />
          </Card>
        ))}

        {(monthDashboard ? [] : progress.weeklyReviews).map(({ week, review }) => (
          <Card key={week} className="lg:col-span-2">
            <CoachReviewPanel
              scope="week"
              periodKey={week}
              label={`week of ${longDate(week)}`}
              content={review?.content ?? null}
              updatedAt={review ? londonTime(review.updated_at) : null}
              brief={briefs.get(week) ?? null}
              canWrite
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  n,
  hint,
}: {
  label: string;
  value: number | null | undefined;
  /** Attempts behind the rate. Omitted for the target, which has no n. */
  n?: number | null;
  hint: string;
}) {
  const enough = n === undefined || (n ?? 0) >= MIN_ATTEMPTS_FOR_RATE;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-text-faint">{label}</div>
      <div className="tnum text-xl font-semibold">
        {value == null || !enough ? "—" : `${value}%`}
      </div>
      <div className="text-[10px] text-text-faint">
        {value != null && !enough ? `${hint}, too few for a rate` : hint}
      </div>
    </div>
  );
}

/**
 * A stand rate and the attempts behind it, or the attempts alone.
 *
 * The counts are always shown; the percentage only once there are enough
 * attempts for it to mean anything. A rate that is shown sometimes and
 * withheld other times is more informative than one that is always shown,
 * because the withholding is itself a fact about the record.
 */
function Rate({
  pct,
  stood,
  n,
}: {
  pct: number | null | undefined;
  stood: number | null | undefined;
  n: number | null | undefined;
}) {
  if (!n) return <span className="text-text-faint">—</span>;
  const enough = n >= MIN_ATTEMPTS_FOR_RATE;
  return (
    <>
      {enough && pct != null ? `${pct}%` : <span className="text-text-faint">—</span>}
      <span className="ml-1 text-[10px] font-normal text-text-faint">
        {stood ?? "?"}/{n}
      </span>
    </>
  );
}
