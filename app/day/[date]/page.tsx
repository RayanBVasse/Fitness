import { notFound } from "next/navigation";
import { getDayDetail, getReferenceData } from "@/lib/queries";
import { londonToday } from "@/lib/time";
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
