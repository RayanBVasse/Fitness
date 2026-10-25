import { createClient } from "@supabase/supabase-js";

/**
 * Two clients, deliberately separated.
 *
 * readClient  — the anon key. Browser-safe only because RLS grants SELECT and
 *               nothing else. Used for every read.
 * adminClient — the service-role key. Server-only, bypasses RLS, and is the
 *               single write path. Never import this into a client component.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

/**
 * Both clients are scoped to the `fitness` schema, which changes the client's
 * generic parameters. The type is derived from the factory rather than written
 * out, so it tracks whatever shape supabase-js uses.
 */
function create(baseUrl: string, key: string) {
  return createClient(baseUrl, key, {
    db: { schema: "fitness" },
    auth: { persistSession: false },
  });
}

export type FitnessClient = ReturnType<typeof create>;

let read: FitnessClient | null = null;

export function readClient(): FitnessClient {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  read ??= create(url, anonKey);
  return read;
}

export function adminClient(): FitnessClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Write path is not configured. Set SUPABASE_SERVICE_ROLE_KEY in the server environment.",
    );
  }
  return create(url, serviceKey);
}

/**
 * Reads return `{ data, error }` rather than throwing, so a page can render a
 * setup state when the schema has not been applied yet instead of 500ing.
 */
export async function safeRead<T>(
  run: (client: FitnessClient) => PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<{ data: T | null; error: string | null }> {
  if (!isConfigured) return { data: null, error: "not_configured" };
  try {
    const { data, error } = await run(readClient());
    return { data: data ?? null, error: error ? error.message : null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}
