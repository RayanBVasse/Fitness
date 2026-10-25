import { Card } from "@/components/ui";

/**
 * Shown until the schema is reachable. The app is useless without it, so the
 * first screen says exactly what is missing rather than failing silently.
 */
export function SetupNotice({ error }: { error: string | null }) {
  const notConfigured = error === "not_configured";

  return (
    <Card className="mt-5">
      <h1 className="text-lg font-bold">Not connected yet</h1>
      <p className="mt-1 text-sm text-text-dim">
        {notConfigured
          ? "Supabase environment variables are not set for this deployment."
          : "The Supabase project answered, but the fitness schema could not be read."}
      </p>

      <ol className="mt-4 space-y-3 text-sm">
        <li>
          <span className="font-semibold">1. Run the migrations.</span>
          <div className="text-text-dim">
            In the Supabase SQL editor, run{" "}
            <code className="rounded bg-surface-2 px-1">supabase/migrations/0001_init.sql</code>{" "}
            then{" "}
            <code className="rounded bg-surface-2 px-1">supabase/migrations/0002_seed.sql</code>.
          </div>
        </li>
        <li>
          <span className="font-semibold">2. Expose the schema.</span>
          <div className="text-text-dim">
            Settings → API → Exposed schemas: add <code className="rounded bg-surface-2 px-1">fitness</code>.
            Without this the REST API cannot see the tables even though they exist.
          </div>
        </li>
        <li>
          <span className="font-semibold">3. Set the environment variables.</span>
          <div className="text-text-dim">
            <code className="rounded bg-surface-2 px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code className="rounded bg-surface-2 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,{" "}
            <code className="rounded bg-surface-2 px-1">SUPABASE_SERVICE_ROLE_KEY</code> and{" "}
            <code className="rounded bg-surface-2 px-1">FITNESS_WRITE_PASSCODE</code>. The last two
            are server-only and must never be prefixed with NEXT_PUBLIC.
          </div>
        </li>
      </ol>

      {error && !notConfigured ? (
        <p className="mt-4 rounded-[var(--radius)] bg-surface-2 p-2 text-xs text-text-faint">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
