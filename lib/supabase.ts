import { createClient } from "@supabase/supabase-js";

/**
 * One credential, server-side only.
 *
 * Migration 0005 revoked every anon grant on the `fitness` schema, so the anon
 * key now opens nothing and no client-side read is possible. Reads and writes
 * both run with the service-role key, inside server components and route
 * handlers that the middleware has already authenticated.
 *
 * Nothing in this file may be imported from a client component.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isConfigured = Boolean(url && serviceKey);

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
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  read ??= create(url, serviceKey);
  return read;
}

export function adminClient(): FitnessClient {
  return readClient();
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
