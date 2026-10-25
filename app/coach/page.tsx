import { randomUUID } from "node:crypto";
import { CoachChat } from "@/components/coach/CoachChat";

export const dynamic = "force-dynamic";

export default function CoachPage() {
  // A fresh conversation per visit for now; history lives in coach_messages
  // and a conversation picker arrives with the hypothesis register.
  return <CoachChat conversationId={randomUUID()} />;
}
