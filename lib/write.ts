"use client";

/**
 * Client side of the write path. Posts to /api/write with the passcode the
 * user entered once; the passcode is the only thing standing between a public
 * URL and ten months of training history, so it is never embedded in the
 * bundle — it lives in this browser's localStorage and nowhere else.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "fitness.passcode";

export function getPasscode(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * The passcode is external state (this browser's localStorage), so it is read
 * through a store rather than copied into component state inside an effect.
 * That keeps the server render and the first client render agreeing.
 */
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab unlocking or locking should propagate here too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Server and prerender see no passcode; the client fills it in on hydration. */
function serverSnapshot(): string | null {
  return null;
}

export function usePasscode(): string | null {
  return useSyncExternalStore(subscribe, getPasscode, serverSnapshot);
}

export function setPasscode(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* Private mode or blocked storage: the passcode simply will not persist. */
  }
  emit();
}

export function clearPasscode(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

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
  const passcode = getPasscode();
  const response = await fetch("/api/write", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(passcode ? { "x-fitness-passcode": passcode } : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
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
