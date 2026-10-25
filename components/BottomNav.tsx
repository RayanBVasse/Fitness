"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DESTINATIONS = [
  { href: "/", label: "Today" },
  { href: "/history", label: "History" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex w-full max-w-[520px]">
        {DESTINATIONS.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: active ? "var(--accent)" : "var(--text-faint)" }}
              >
                <span
                  aria-hidden
                  className="h-[3px] w-6 rounded-full"
                  style={{ background: active ? "var(--accent)" : "transparent" }}
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
