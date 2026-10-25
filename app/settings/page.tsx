import { safeRead } from "@/lib/supabase";
import { getReferenceData } from "@/lib/queries";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, Pill, SectionTitle } from "@/components/ui";

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
        <SectionTitle>Write access</SectionTitle>
        <p className="text-sm text-text-dim">
          This site is public and readable by anyone with the link. Logging requires the passcode,
          entered once per device on the Today screen. All writes run server-side; the service-role
          key is never sent to the browser.
        </p>
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
