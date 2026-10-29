import { notFound } from "next/navigation";
import { composeDayBrief } from "@/lib/brief";
import { getDayDetail, getReferenceData } from "@/lib/queries";
import { londonTime, londonToday } from "@/lib/time";
import { SetupNotice } from "@/components/SetupNotice";
import { DayEditor } from "@/components/day/DayEditor";

export const dynamic = "force-dynamic";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;

  // A day is a calendar date, and the future has no facts in it.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > londonToday()) notFound();

  const [detail, reference] = await Promise.all([getDayDetail(date), getReferenceData()]);
  if (detail.error) return <SetupNotice error={detail.error} />;
  if (reference.error) return <SetupNotice error={reference.error} />;

  const gymId = detail.sessions[0]?.gym_id ?? null;
  const brief = composeDayBrief({
    date,
    day: detail.day,
    gymName: reference.gyms.find((g) => g.id === gymId)?.name ?? null,
    metricDefs: detail.metricDefs,
    metrics: detail.metrics,
    snatchBlocks: detail.snatchBlocks,
    snatchAttempts: detail.snatchAttempts,
    hypertrophySets: detail.hypertrophySets,
    calisthenicsEntries: detail.calisthenicsEntries,
    calisthenicsAttempts: detail.calisthenicsAttempts,
    notes: detail.notes,
    variations: reference.variations,
    exercises: reference.exercises,
    skillVariations: reference.skillVariations,
    assistanceTypes: reference.assistanceTypes,
    thirdParties: reference.thirdParties,
  });

  return (
    <DayEditor
      date={date}
      day={detail.day}
      sessions={detail.sessions}
      loggedCounts={detail.loggedCounts}
      metricDefs={detail.metricDefs}
      metrics={detail.metrics}
      lastMetricValues={detail.lastMetricValues}
      blocks={detail.blocks}
      snatchBlocks={detail.snatchBlocks}
      snatchAttempts={detail.snatchAttempts}
      hypertrophySets={detail.hypertrophySets}
      calisthenicsEntries={detail.calisthenicsEntries}
      calisthenicsAttempts={detail.calisthenicsAttempts}
      notes={detail.notes}
      review={detail.review}
      reviewSavedAt={detail.review ? londonTime(detail.review.updated_at) : null}
      brief={brief.text}
      presets={reference.presets}
      variations={reference.variations}
      failureModes={reference.failureModes}
      ladder={reference.ladder}
      exercises={reference.exercises}
      muscleGroups={reference.muscleGroups}
      muscleRegions={reference.muscleRegions}
      skills={reference.skills}
      skillVariations={reference.skillVariations}
      assistanceTypes={reference.assistanceTypes}
      isToday={date === londonToday()}
    />
  );
}
