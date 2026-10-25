"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const value = passcode.trim();
        if (!value) return;
        startTransition(async () => {
          const response = await fetch("/api/auth", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ passcode: value }),
          });
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            setError(body.error ?? "Could not sign in");
            setPasscode("");
            return;
          }
          // `next` is read from our own URL and only ever used as a path, so a
          // crafted link cannot bounce the session somewhere else.
          const next = params.get("next");
          router.replace(next?.startsWith("/") ? next : "/");
          router.refresh();
        });
      }}
      className="space-y-3"
    >
      <input
        type="password"
        value={passcode}
        onChange={(event) => setPasscode(event.target.value)}
        placeholder="Passcode"
        autoComplete="current-password"
        autoFocus
        className="min-h-[52px] w-full rounded-[var(--radius)] border border-border bg-surface-2 px-3 text-base"
        aria-label="Passcode"
        aria-invalid={error ? true : undefined}
      />
      <button
        type="submit"
        disabled={pending || !passcode.trim()}
        className="min-h-[52px] w-full rounded-[var(--radius)] text-base font-bold disabled:opacity-40"
        style={{ background: "var(--accent)", color: "var(--accent-text)" }}
      >
        {pending ? "Checking…" : "Unlock"}
      </button>
      {error ? (
        <p role="alert" className="text-sm" style={{ color: "var(--missed)" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
