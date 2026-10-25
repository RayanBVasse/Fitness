"use client";

/**
 * Client side of the write path. Authorisation is the session cookie, which
 * the browser attaches automatically and JavaScript cannot read — so there is
 * no secret in this module and nothing to store.
 */

export class WriteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WriteError";
  }
}

export async function write<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    // The session expired while the page stayed open: send them to sign in
    // again rather than showing a stale error over an unusable screen.
    // A full load, not a router push: a soft navigation would leave the
    // rendered payloads for this session's data sitting in the client cache.
    if (response.status === 401 && typeof window !== "undefined") {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.error === "string") message = body.error;
    } catch {
      /* keep the generic message */
    }
    throw new WriteError(message, response.status);
  }

  return (await response.json()) as T;
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth", { method: "DELETE" });
  // Signing out has to discard what the client already holds, so this is a
  // full document load rather than a client-side navigation.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}
