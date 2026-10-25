import { getContextNotes } from "@/lib/queries";
import { SetupNotice } from "@/components/SetupNotice";
import { NotesReview } from "@/components/notes/NotesReview";

export const dynamic = "force-dynamic";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; month?: string; noteType?: string }>;
}) {
  const params = await searchParams;
  const status = params.status ?? "pending";
  const data = await getContextNotes({ status, month: params.month, noteType: params.noteType });
  if (data.error) return <SetupNotice error={data.error} />;

  return (
    <NotesReview
      notes={data.notes}
      counts={data.counts}
      months={data.months}
      noteTypes={data.noteTypes}
      filters={{ status, month: params.month, noteType: params.noteType }}
    />
  );
}
