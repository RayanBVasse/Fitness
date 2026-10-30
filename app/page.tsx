import { composeDayBrief } from "@/lib/brief";
import { getReferenceData, getSnatchSuccessBySource, getToday } from "@/lib/queries";
import { londonTime, londonToday } from "@/lib/time";
import { SetupNotice } from "@/components/SetupNotice";
import { TodayScreen } from "@/components/today/TodayScreen";

// Always current: a training log must never serve a cached session.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const date = londonToday();
  const [reference, today, rates] = await Promise.all([
    getReferenceData(),
    getToday(date),
    getSnatchSuccessBySource(),
  ]);

  // No gyms means the seed has not run, whatever else succeeded.
  if (reference.error || reference.gyms.length === 0) {
    return <SetupNotice error={reference.error ?? "No reference data found in schema `fitness`."} />;
  }

  // Logged only, and at the objective's own load. The imported
  // reconstruction is kept out: a rate that blends the two would describe
  // neither, which is why the by-load table splits them.
  const primaryLoad = reference.objective?.primary_load_kg ?? null;
  const loggedAtPrimary = (rates.data ?? []).find(
    (r) => Number(r.weight_kg) === primaryLoad && r.source === "logged",
  );
  const objectiveRate = loggedAtPrimary
    ? { stood: Number(loggedAtPrimary.stood), attempts: Number(loggedAtPrimary.attempts) }
    : null;

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
      gyms={reference.gyms}
      failureModes={reference.failureModes}
      presets={reference.presets}
      variations={reference.variations}
      ladder={reference.ladder}
      objective={reference.objective}
      objectiveRate={objectiveRate}
      weekdayThemes={reference.weekdayThemes}
    />
  );
}
