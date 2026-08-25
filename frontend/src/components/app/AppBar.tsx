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
/** The measures a bar can take, matching the ladder in globals.css. */
const WIDTHS = {
  content: "max-w-content",
  wide: "max-w-wide",
  ultra: "max-w-ultra",
} as const;

export function AppBar({
  brandHref = "/",
  onBrandClick,
  context,
  status,
  width = "wide",
  children,
}: {
  brandHref?: string;
  /** When set, the wordmark resets the screen instead of navigating away. */
  onBrandClick?: () => void;
  /** What is being worked on — the job, or the section of the Library. */
  context?: ReactNode;
  /** A short live readout, e.g. how many changes are applied. */
  status?: ReactNode;
  /**
   * Which measure from the shared ladder.
   *
   * It must be the same one the page's own content uses. A bar capped at 96rem
   * over a working surface capped at 112rem does not read as a considered
   * difference — on a wide display it reads as the wordmark being eight
   * millimetres out, which is exactly close enough to look like a mistake.
   */
  width?: keyof typeof WIDTHS;
  children?: ReactNode;
}) {
  return (
    <div className="gutter-bar sticky top-0 z-30 pt-3">
      <header
        className={cn(
          // Fixed height and no wrapping. A pill that wraps is not a pill: the
          // radius that reads as one continuous edge at 44px tall reads as two
          // stacked lozenges at 88px, and the page below it jumps by that
          // difference the moment a status readout appears.
          "mx-auto flex h-14 items-center gap-x-3 rounded-pill bg-raised/85 px-3 shadow-float ring-1 ring-ink/5 backdrop-blur-xl",
          WIDTHS[width],
        )}
      >
        {/*
         * `shrink`, not `flex-1`.
         *
         * With `flex-1` this side has a basis of zero and grows into whatever
         * is spare — which is right until nothing is spare. Then it is the
         * actions that overflow, this side keeps its zero basis, and the
         * wordmark inside it (correctly `shrink-0`) paints straight out of a box
         * that has collapsed underneath it. On the Library's phone layout that
         * put "Aptly" and "Tailor a CV" on top of one another.
         *
         * Sized by its content instead, and giving way through the one thing in
         * it that can: the context label, which truncates.
         */}
        <div className="flex min-w-0 shrink items-center gap-2.5">
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

          {/* Hidden on the narrowest phones. It names the screen you are already
              looking at, which is the first thing to give up when the row runs
              out of width — every action beside it is worth more. */}
          {context && (
            <span className="hidden truncate text-sm text-slate sm:inline">
              {context}
            </span>
          )}
        </div>

        {/*
         * The actions, allowed to scroll rather than to wrap or to overflow.
         *
         * This row carries whatever the screen needs — the Library's sign-out
         * carries an email address — and no arrangement of hiding fits every
         * one of them on a 320px phone. Scrolling is the honest fallback: the
         * bar keeps its shape, nothing is silently unreachable, and on any
         * window wide enough it never engages at all.
         */}
        <div className="no-scrollbar scroll-x ml-auto flex min-w-0 shrink items-center gap-1.5">
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
        // `whitespace-nowrap` because this now lives in a scrolling strip: a
        // link allowed to wrap inside one collapses to a two-line sliver rather
        // than pushing the strip wide enough to scroll.
        "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-pill px-3 font-display text-xs transition-colors",
        emphasis === "solid"
          ? "bg-ink font-medium text-paper hover:bg-ink-soft"
          : "text-slate hover:bg-sunken hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
