import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Fitness Observatory",
  // The only page an unauthenticated visitor can reach, so it is also the only
  // one a crawler could find. Keep it out of indexes.
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] flex-col justify-center">
      <h1 className="text-2xl font-bold">Fitness Observatory</h1>
      <p className="mt-1 text-sm text-text-dim">Private. Enter the passcode to continue.</p>
      {/* The form reads `next` from the query string, so it renders on the
          client; the page shell around it stays static. */}
      <div className="mt-5">
        <Suspense fallback={<div className="h-[52px] rounded-[var(--radius)] bg-surface-2" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
