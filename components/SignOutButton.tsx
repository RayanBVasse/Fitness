"use client";

import { useTransition } from "react";
import { signOut } from "@/lib/write";

export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => signOut())}
      className="min-h-[44px] w-full rounded-[var(--radius)] border border-border text-sm font-semibold disabled:opacity-40"
    >
      {pending ? "Signing out…" : "Sign out on this device"}
    </button>
  );
}
