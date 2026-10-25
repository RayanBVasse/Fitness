import { safeRead } from "@/lib/supabase";
import { getReferenceData } from "@/lib/queries";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, Pill, SectionTitle } from "@/components/ui";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

/**
 * Settings is where the rules are visible. Progression thresholds and analysis
 * guardrails are stored as data, so they can be read and audited here rather
 * than inferred from behaviour.
 */
export default async function SettingsPage() {
  const reference = await getReferenceData();
  if (reference.error) return <SetupNotice error={reference.error} />;

  const settings = await safeRead<{ key: string; value: unknown; notes: string | null }[]>((c) =>
    c.from("settings").select("key, value, notes").order("key"),
  );

  const rows = settings.data ?? [];
  const rules = rows.find((r) => r.key === "progression_rules");
  const guardrails = rows.find((r) => r.key === "analysis_guardrails");

  return (
    <div className="space-y-4 pt-5">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-text-dim">Libraries, rules and guardrails.</p>
      </header>

      <Card>
        <SectionTitle>Libraries</SectionTitle>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="Gyms" value={reference.gyms.length} />
          <Row label="Lift variations" value={reference.variations.length} />
          <Row label="Weight presets" value={reference.presets.length} />
          <Row label="Failure modes" value={reference.failureModes.length} />
          <Row label="Technique tags" value={reference.tags.length} />
          <Row
            label="Heavy session"
            value={
              reference.heavyThresholdKg !== null ? `${reference.heavyThresholdKg} kg+` : "—"
            }
          />
        </dl>
        <p className="mt-3 text-[11px] text-text-faint">
          Editing libraries from this screen arrives with Phase 2; for now they are managed in the
          seed migration.
        </p>
      </Card>

      {rules ? (
        <Card>
          <SectionTitle>Progression rules</SectionTitle>
          <p className="text-xs leading-snug text-text-dim">{rules.notes}</p>
          <pre className="mt-3 max-h-80 overflow-auto rounded-[var(--radius)] bg-surface-2 p-3 text-[11px] leading-relaxed">
            {JSON.stringify(rules.value, null, 2)}
          </pre>
        </Card>
      ) : null}

      {guardrails ? (
        <Card>
          <SectionTitle>Analysis guardrails</SectionTitle>
          <p className="text-xs leading-snug text-text-dim">{guardrails.notes}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill>No diagnosis</Pill>
            <Pill>No causal attribution</Pill>
            <Pill>Correlation labelled</Pill>
            <Pill>Flags insufficient data</Pill>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto rounded-[var(--radius)] bg-surface-2 p-3 text-[11px] leading-relaxed">
            {JSON.stringify(guardrails.value, null, 2)}
          </pre>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Access</SectionTitle>
        <p className="text-sm text-text-dim">
          This app is private. Every page and every write requires a session, held in an
          HttpOnly cookie that JavaScript cannot read. The database grants nothing to anonymous
          callers, so the data is unreadable over the API as well as through the site. All queries
          run server-side; no key reaches the browser.
        </p>
        <div className="mt-3">
          <SignOutButton />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-text-faint">{label}</dt>
      <dd className="tnum text-lg font-semibold">{value}</dd>
    </div>
  );
}
