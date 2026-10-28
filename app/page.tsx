import { composeDayBrief } from "@/lib/brief";
import { getReferenceData, getToday } from "@/lib/queries";
import { londonTime, londonToday } from "@/lib/time";
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

  // Composed here, on the server, so the redaction list never reaches the
  // browser and the client component receives a finished string.
  const gymId = today.sessions[0]?.gym_id ?? null;
  const brief = composeDayBrief({
    date,
    day: today.day,
    gymName: reference.gyms.find((g) => g.id === gymId)?.name ?? null,
    metricDefs: today.metricDefs,
    metrics: today.metrics,
    snatchBlocks: today.snatchBlocks,
    snatchAttempts: today.snatchAttempts,
    hypertrophySets: today.hypertrophySets,
    calisthenicsEntries: today.calisthenicsEntries,
    calisthenicsAttempts: today.calisthenicsAttempts,
    notes: today.notes,
    injuries: reference.injuries,
    bodyObservations: today.bodyObservations,
    activities: reference.provokingActivities,
    variations: reference.variations,
    exercises: reference.exercises,
    skillVariations: reference.skillVariations,
    assistanceTypes: reference.assistanceTypes,
    thirdParties: reference.thirdParties,
  });

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
      snatchAttempts={today.snatchAttempts}
      hypertrophySets={today.hypertrophySets}
      calisthenicsEntries={today.calisthenicsEntries}
      calisthenicsAttempts={today.calisthenicsAttempts}
      lastExerciseSettings={today.lastExerciseSettings}
      lastSkillSettings={today.lastSkillSettings}
      recentExerciseIds={today.recentExerciseIds}
      recentSkillVariationIds={today.recentSkillVariationIds}
      muscleGroups={reference.muscleGroups}
      muscleRegions={reference.muscleRegions}
      exercises={reference.exercises}
      skills={reference.skills}
      skillVariations={reference.skillVariations}
      assistanceTypes={reference.assistanceTypes}
      lastSession={today.lastSession}
      notes={today.notes}
      review={today.review}
      reviewSavedAt={today.review ? londonTime(today.review.updated_at) : null}
      brief={brief.text}
      injuries={reference.injuries}
      provokingActivities={reference.provokingActivities}
      bodyObservations={today.bodyObservations}
      gyms={reference.gyms}
      failureModes={reference.failureModes}
      presets={reference.presets}
      variations={reference.variations}
      ladder={reference.ladder}
      objective={reference.objective}
      weekdayThemes={reference.weekdayThemes}
    />
  );
}
