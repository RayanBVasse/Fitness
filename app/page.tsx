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
      session={today.session}
      blocks={today.blocks}
      snatchBlocks={today.snatchBlocks}
      lastSession={today.lastSession}
      gyms={reference.gyms}
      presets={reference.presets}
      variations={reference.variations}
      failureModes={reference.failureModes}
      ladder={reference.ladder}
      objective={reference.objective}
    />
  );
}
