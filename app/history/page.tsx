import Link from "next/link";
import { getHistory, getReferenceData } from "@/lib/queries";
import { SetupNotice } from "@/components/SetupNotice";
import { HistoryList } from "@/components/history/HistoryList";
import { Card, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const [history, reference] = await Promise.all([getHistory(), getReferenceData()]);
  if (history.error) return <SetupNotice error={history.error} />;

  if (history.sessions.length === 0) {
    return (
      <div className="mx-auto max-w-[820px] space-y-4 pt-5">
        <header>
          <h1 className="text-2xl font-bold">History</h1>
        </header>
        <Card>
          <Empty>
            No sessions recorded yet. Start one on{" "}
            <Link href="/" className="underline underline-offset-2">
              Today
            </Link>
            , or promote the staged Jan–Oct 2026 backfill.
          </Empty>
        </Card>
      </div>
    );
  }

  return (
    <HistoryList
      sessions={history.sessions}
      restDays={history.restDays}
      reconstructedCount={history.reconstructedCount}
      heavyThresholdKg={reference.heavyThresholdKg}
    />
  );
}
