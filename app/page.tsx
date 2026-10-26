import { getReferenceData, getToday } from "@/lib/queries";
import { londonToday } from "@/lib/time";
import { SetupNotice } from "@/components/SetupNotice";
import { TodayScreen } from "@/components/today/TodayScreen";

// Always current: a training log must never serve a cached session.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const date = londonToday();
  const [reference, today] = await Promise.all([getReferenceData(), getToday(date)]);

  // No gyms means the seed has not run, whatever else succeeded.
  if (reference.error || reference.gyms.length === 0) {
    return <SetupNotice error={reference.error ?? "No reference data found in schema `fitness`."} />;
  }

  return (
    <TodayScreen
      date={date}
      day={today.day}
      metricDefs={today.metricDefs}
      metrics={today.metrics}
      lastMetricValues={today.lastMetricValues}
      sessions={today.sessions}
      blocks={today.blocks}
      snatchBlocks={today.snatchBlocks}
      hypertrophySets={today.hypertrophySets}
      calisthenicsEntries={today.calisthenicsEntries}
      lastExerciseSettings={today.lastExerciseSettings}
      lastSkillSettings={today.lastSkillSettings}
      recentExerciseIds={today.recentExerciseIds}
      recentSkillVariationIds={today.recentSkillVariationIds}
      muscleGroups={reference.muscleGroups}
      exercises={reference.exercises}
      skills={reference.skills}
      skillVariations={reference.skillVariations}
      assistanceTypes={reference.assistanceTypes}
      lastSession={today.lastSession}
      gyms={reference.gyms}
      presets={reference.presets}
      variations={reference.variations}
      ladder={reference.ladder}
      objective={reference.objective}
    />
  );
}
