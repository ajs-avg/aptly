"use client";

import Link from "next/link";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The app's top bar.
 *
 * The same object as the landing page's header — a frosted pill with the
 * circular mark on the left and the actions on the right — so moving from the
 * front door into the product does not feel like arriving at a different
 * piece of software. It is not the same *density*: the app carries live state
 * and real actions, so it sits tighter and holds more.
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
  account,
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
   * The account control, seated *outside* the scrolling strip.
   *
   * The strip is `overflow-x: auto`, and a scroll container clips its
   * absolutely-positioned children — so a dropdown anchored to a button
   * inside it opens into a 36px letterbox. The account menu is exactly that
   * dropdown, and the button is small and fixed-width, so it sits beside the
   * strip rather than in it.
   */
  account?: ReactNode;
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
  const brandClass =
    "flex shrink-0 items-center gap-2.5 rounded-pill py-1 pl-1 pr-2 font-display text-[15px] font-semibold tracking-[-0.02em] text-ink transition-colors hover:text-signal";

  return (
    <div className="gutter-bar sticky top-0 z-30 pt-2">
      <header
        className={cn(
          // Fixed height and no wrapping. A pill that wraps is not a pill: the
          // radius that reads as one continuous edge at 56px tall reads as two
          // stacked lozenges at 112px, and the page below it jumps by that
          // difference the moment a status readout appears.
          "mx-auto flex h-12 items-center gap-x-3 rounded-xl border border-hairline bg-paper/80 px-3 backdrop-blur-xl backdrop-saturate-150",
          WIDTHS[width],
        )}
      >
        {/*
         * `shrink`, not `flex-1`: sized by its content, and giving way through
         * the one thing in it that can — the context label, which truncates.
         */}
        <div className="flex min-w-0 shrink items-center gap-2.5">
          {onBrandClick ? (
            <button type="button" onClick={onBrandClick} className={brandClass}>
              <Mark />
              Aptly
            </button>
          ) : (
            <Link href={brandHref} className={brandClass}>
              <Mark />
              Aptly
            </Link>
          )}

          {/* Hidden on the narrowest phones. It names the screen you are already
              looking at, which is the first thing to give up when the row runs
              out of width — every action beside it is worth more. */}
          {context && (
            <span className="hidden truncate text-sm text-slate sm:inline">
              <span aria-hidden className="pr-2.5 text-hairline">
                /
              </span>
              {context}
            </span>
          )}
        </div>

        {/*
         * The actions, allowed to scroll rather than to wrap or to overflow.
         * Scrolling is the honest fallback: the bar keeps its shape, nothing is
         * silently unreachable, and on any window wide enough it never engages.
         */}
        <div className="no-scrollbar scroll-x ml-auto flex min-w-0 shrink items-center gap-1.5">
          <ThemeToggle className="hidden sm:inline-flex" />
          {status}
          {children}
        </div>
        {account && <div className="flex shrink-0 items-center">{account}</div>}
      </header>
    </div>
  );
}

/** The mark: an ink circle with the initial, the same one the front door wears. */
function Mark() {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-ink font-display text-[15px] font-semibold leading-none text-paper"
    >
      <span className="translate-y-px">A</span>
    </span>
  );
}

/** A pill link, matching the landing page's secondary and primary actions. */
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
        "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-pill px-3.5 font-display text-xs font-medium transition-[background-color,color,transform] duration-200",
        emphasis === "solid"
          ? "bg-ink text-paper shadow-raised hover:-translate-y-px hover:bg-ink-soft"
          : "text-slate hover:bg-sunken hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
