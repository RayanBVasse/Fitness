import { notFound } from "next/navigation";
import { getDayDetail } from "@/lib/queries";
import { londonToday } from "@/lib/time";
import { SetupNotice } from "@/components/SetupNotice";
import { DayEditor } from "@/components/day/DayEditor";

export const dynamic = "force-dynamic";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;

  // A day is a calendar date, and the future has no facts in it.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > londonToday()) notFound();

  const detail = await getDayDetail(date);
  if (detail.error) return <SetupNotice error={detail.error} />;

  return (
    <DayEditor
      date={date}
      day={detail.day}
      sessions={detail.sessions}
      loggedCounts={detail.loggedCounts}
      metricDefs={detail.metricDefs}
      metrics={detail.metrics}
      isToday={date === londonToday()}
    />
  );
}
