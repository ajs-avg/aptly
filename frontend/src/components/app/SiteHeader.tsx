"use client";

import Link from "next/link";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";

/**
 * The header for pages that sit between the landing page and the app — the
 * sign-in screen today.
 *
 * It takes the landing page's shape, not the marketing nav's contents. The nav
 * carried four anchors to sections that exist only on `/`; rendered here they
 * were four links that scrolled nowhere. This holds what a page outside the
 * product can actually offer: the way back, and the lights.
 */
export function SiteHeader({
  back = { href: "/", label: "Back to home" },
  className,
}: {
  back?: { href: string; label: string } | null;
  className?: string;
}) {
  return (
    <div className={cn("gutter sticky top-0 z-30 pt-3", className)}>
      <header className="mx-auto flex h-14 max-w-content items-center gap-3 rounded-pill border border-ink/[0.07] bg-raised/75 px-2.5 shadow-lifted backdrop-blur-xl backdrop-saturate-150">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-pill px-2 py-2 font-display text-sm font-semibold tracking-[-0.02em] text-ink transition-colors hover:text-signal"
        >
          <Mark />
          Aptly
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ThemeToggle className="hidden sm:inline-flex" />
          {back && (
            <Link
              href={back.href}
              className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-pill px-3.5 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink"
            >
              {back.label}
            </Link>
          )}
        </div>
      </header>
    </div>
  );
}

/** A folded sheet — the product's one object, at 16px. */
function Mark() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4">
      <path
        d="M4 2.5h7.5L16 7v10.5H4z"
        fill="var(--color-raised)"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M11.5 2.5V7H16" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.5 11h7M6.5 13.5h4.5"
        stroke="var(--color-signal)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
