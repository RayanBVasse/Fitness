"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The primary navigation, across the top.
 *
 * It used to be a bar fixed to the bottom of the viewport, which is the right
 * shape for a thumb and the wrong one for this app: the log is kept on a
 * tablet and read on a desktop, where a bar pinned to the bottom of a
 * 1400px window is a long way from anything being looked at.
 *
 * Sticky rather than fixed, so it travels down a long Progress page without
 * needing the body to reserve room for it.
 */

const DESTINATIONS = [
  { href: "/", label: "Today" },
  { href: "/history", label: "History" },
  { href: "/progress", label: "Progress" },
  { href: "/coach", label: "Coach" },
  { href: "/settings", label: "Settings" },
] as const;

export function TopNav() {
  const pathname = usePathname();

  // Nothing to navigate to before signing in: every destination would bounce
  // straight back here. Checked on the client so /login stays static.
  if (pathname === "/login") return null;

  return (
    <nav
      className="sticky top-0 z-20 mb-2 border-b border-border bg-surface/95 backdrop-blur"
      aria-label="Primary"
    >
      <ul className="mx-auto flex w-full max-w-[1180px] gap-1 px-2 sm:gap-2 sm:px-4 lg:px-6">
        {DESTINATIONS.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                // The underline carries the current page, not colour alone.
                className="flex h-[52px] items-center border-b-2 px-2 text-[11px] font-semibold uppercase tracking-wide sm:px-3 sm:text-xs"
                style={{
                  color: active ? "var(--accent)" : "var(--text-faint)",
                  borderColor: active ? "var(--accent)" : "transparent",
                }}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
