"use client";

import Link from "next/link";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The app's top bar.
 *
 * Deliberately the same *shape* as the marketing nav — a floating pill, same
 * radius, same shadow — so moving from the landing page into the product does
 * not feel like arriving at a different piece of software. It is not the same
 * *density*: the app carries live state and real actions, so it sits tighter
 * and holds more.
 */
export function AppBar({
  brandHref = "/",
  onBrandClick,
  context,
  status,
  children,
}: {
  brandHref?: string;
  /** When set, the wordmark resets the screen instead of navigating away. */
  onBrandClick?: () => void;
  /** What is being worked on — the job, or the section of the Library. */
  context?: ReactNode;
  /** A short live readout, e.g. how many changes are applied. */
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 px-3 pt-3">
      <header className="mx-auto flex max-w-wide flex-wrap items-center gap-x-3 gap-y-2 rounded-pill bg-raised/85 px-3 py-2 shadow-float ring-1 ring-ink/5 backdrop-blur-xl">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {onBrandClick ? (
            <button
              type="button"
              onClick={onBrandClick}
              className="flex shrink-0 items-center gap-2 rounded-pill px-1 font-display text-sm font-semibold tracking-tight text-ink transition-colors hover:text-signal"
            >
              <Mark />
              Aptly
            </button>
          ) : (
            <Link
              href={brandHref}
              className="flex shrink-0 items-center gap-2 rounded-pill px-1 font-display text-sm font-semibold tracking-tight text-ink transition-colors hover:text-signal"
            >
              <Mark />
              Aptly
            </Link>
          )}

          {context && (
            <span className="truncate text-sm text-slate">{context}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle className="hidden sm:inline-flex" />
          {status}
          {children}
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
        fill="#fbfbfa"
        stroke="#16181d"
        strokeWidth="1.4"
      />
      <path d="M11.5 2.5V7H16" fill="none" stroke="#16181d" strokeWidth="1.4" />
      <path
        d="M6.5 11h7M6.5 13.5h4.5"
        stroke="#14655c"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A pill link, matching the marketing nav's secondary action. */
export function BarLink({
  href,
  children,
  emphasis = "quiet",
}: {
  href: string;
  children: ReactNode;
  emphasis?: "quiet" | "solid";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-8 items-center rounded-pill px-3 font-display text-xs transition-colors",
        emphasis === "solid"
          ? "bg-ink font-medium text-paper hover:bg-ink-soft"
          : "text-slate hover:bg-sunken hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
