import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";

/*
 * The marketing page's vocabulary.
 *
 * A different register from the app on purpose. The app is dense and quiet —
 * someone is working in it. This page has one job, which is to make the
 * recruiter-call problem land, so it is centred, roomy, and built from a few
 * shapes repeated with discipline: a pill, a card, a dark panel.
 */

export function Eyebrow({
  children,
  tone = "signal",
}: {
  children: ReactNode;
  tone?: "signal" | "amber";
}) {
  return (
    <p
      className={cn(
        "flex items-center justify-center gap-2 font-display text-2xs font-medium uppercase tracking-[0.16em]",
        tone === "amber" ? "text-amber-ink" : "text-signal",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          tone === "amber" ? "bg-amber" : "bg-signal",
        )}
      />
      {children}
    </p>
  );
}

/**
 * The page's headline scale.
 *
 * Tight tracking at large sizes is what separates a display setting from
 * body copy scaled up — at 4rem, default letter-spacing reads as gappy.
 */
export function Display({
  children,
  className,
  size = "2rem, 4.6vw, 3.5rem",
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  /** The three arguments to `clamp()`, without the wrapper. */
  size?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag
      className={cn(
        "text-balance font-display font-semibold tracking-[-0.035em] text-ink",
        className,
      )}
      // Size and leading are set together, inline, rather than as two utilities.
      // A fluid `text-[clamp(…)]` and a separate `leading-` class are decided by
      // stylesheet order, not the order they are written — and when leading lost
      // that race the headline's two lines drew on top of one another.
      style={{ fontSize: `clamp(${size})`, lineHeight: 1.06 }}
    >
      {children}
    </Tag>
  );
}

export function Lede({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn("text-pretty leading-relaxed text-slate", className)}
      // Fluid, like the headline above it. A fixed 17px lede under a headline
      // that grows to 86px on a wide display reads as a caption that lost its
      // picture — the two have to move together or the hierarchy inverts.
      style={{ fontSize: "clamp(1rem, 1.15vw, 1.3rem)" }}
    >
      {children}
    </p>
  );
}

/**
 * One section of the page, and the only place its measure is decided.
 *
 * `width` picks from the shared ladder in globals.css rather than from an
 * ad-hoc `max-w-` per section. Three sections that each chose their own were
 * how the page ended up with content columns that *almost* lined up — near
 * enough to look like a mistake, far enough to be one.
 *
 * The vertical rhythm is fluid rather than stepped: a section that breathes
 * correctly at 1440px is cramped at 390 and stranded at 2560, and three
 * breakpoints of `py-` is a coarse way to say something `clamp` says exactly.
 */
export function Section({
  children,
  className,
  id,
  scene,
  width = "content",
  reveal = true,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  /** Names the 3D pose this section holds. See `story/poses.ts`. */
  scene?: string;
  /** Which measure from the shared ladder. `measure` is for prose. */
  width?: "measure" | "content" | "wide";
  /**
   * Arrive on scroll. On by default — the exception is the hero, which is
   * already on screen when the page loads and would otherwise fade in from
   * nothing while the reader is looking straight at it.
   */
  reveal?: boolean;
}) {
  const measureClass = cn(
    "mx-auto",
    width === "measure" && "max-w-measure",
    width === "content" && "max-w-content",
    width === "wide" && "max-w-wide",
  );

  return (
    <section
      id={id}
      data-scene={scene}
      className={cn("gutter", className)}
      // The value lives in globals.css as `--section-pad` rather than here, so
      // that the one place that needs to retune the page's whole vertical
      // rhythm — a phone turned sideways, where there are 390px of height to
      // spend and this alone would take 150 of them — can do it in one rule
      // instead of in every section.
      style={{ paddingBlock: "var(--section-pad)" }}
    >
      {/* Applied here rather than at fifteen call sites. Scroll arrival is a
          property of "being a section", not a decision each one re-makes — and
          centralising it is what keeps the timing identical down the page
          instead of subtly different per section. */}
      {reveal ? (
        <Reveal className={measureClass}>{children}</Reveal>
      ) : (
        <div className={measureClass}>{children}</div>
      )}
    </section>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-pill bg-raised px-3 py-1.5 font-display text-xs text-slate shadow-hairline">
      {children}
    </span>
  );
}

/** A white card floating on the mist. The page's main container shape. */
export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-raised shadow-float ring-1 ring-ink/5",
        // Fluid rather than two steps: a card that is comfortable at 640px has
        // wasteful padding at 380 and thin padding at 1920.
        padded && "[padding:clamp(1.25rem,3.2vw,2.25rem)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A dark inset panel.
 *
 * Used to show the product itself. Real interface detail on a dark ground
 * reads as an object on the page rather than a picture of one, and it gives the
 * amber marks somewhere to actually glow.
 */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-panel p-4 ring-1 ring-ink/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-base text-ink/85">
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="mt-1 h-3.5 w-3.5 shrink-0 text-signal"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 8.5l3.5 3.5 7.5-8" />
      </svg>
      <span>{children}</span>
    </li>
  );
}
