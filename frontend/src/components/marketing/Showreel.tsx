"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  CardPreview,
  ChangeCardPreview,
  CoveragePreview,
  LibraryPreview,
} from "@/components/marketing/previews";
import { EASE, SPRING } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";

/**
 * What Aptly does, shown rather than described, beside the form that asks you
 * to trust it with your CV.
 *
 * The sign-in page's left column was four sentences and three ticks. Sentences
 * are what a product says about itself; nobody arrives believing them, and the
 * one thing that would settle it — seeing the thing work — was on the other
 * side of the sign-up it was arguing for.
 *
 * ── Why this and not a video ───────────────────────────────────────────────
 *
 * A screen recording would be the obvious answer and is the worse one here. It
 * is megabytes on a page whose whole job is to load before somebody changes
 * their mind; it is a fixed resolution on a display that might be 320px or
 * 2560; it is baked in one theme on a page that has two; it goes stale the
 * afternoon the interface changes; and its text is an image, so a screen reader
 * gets nothing.
 *
 * These chapters are the product's own components — the same change card, the
 * same coverage meter, the same Library rows the app renders — so they are
 * sharp at any size, correct in both themes, weigh nothing, and cannot drift
 * from the interface because they *are* it. Which is the argument the page is
 * making: not "here is a picture of a tool", but "here is the tool".
 */

interface Chapter {
  /** The claim, in the fewest words that survive scrutiny. */
  claim: string;
  /** The evidence, in one line. */
  detail: string;
  /** A word for the dots, and for anyone who cannot see them. */
  label: string;
  preview: React.ReactNode;
}

const CHAPTERS: Chapter[] = [
  {
    label: "The change",
    claim: "It shows you the exact line, and why.",
    detail:
      "Your wording, the proposed wording, and the sentence in the job post that asked for it. Apply it or do not — undo is one tap.",
    preview: <ChangeCardPreview />,
  },
  {
    label: "The score",
    claim: "It tells you where you actually stand.",
    detail:
      "Requirement by requirement, with the terms it could not find named. A low number is the most useful thing this product can say.",
    preview: <CoveragePreview />,
  },
  {
    label: "The record",
    claim: "It keeps the post, frozen on the day.",
    detail:
      "Adverts come down. This copy does not — stored with the exact CV you sent and a hash that proves which file it was.",
    preview: <LibraryPreview />,
  },
  {
    label: "The call",
    claim: "And it has your answer ready.",
    detail:
      "Five weeks later the phone rings. Why you fit, the lines that prove it, and the gaps to own honestly — on one screen.",
    preview: <CardPreview />,
  },
];

/** How long each chapter holds before the next one arrives. */
const DWELL_MS = 6000;

export function Showreel({ className }: { className?: string }) {
  const still = useReducedMotion();
  const [index, setIndex] = useState(0);
  /**
   * Set the moment somebody picks a chapter themselves, and never unset.
   *
   * A carousel that resumes after a tap takes the screen back from the person
   * who just took it — they are reading the one they chose, and it slides away
   * mid-sentence. Once they have steered, it stays steered.
   */
  const [steered, setSteered] = useState(false);

  useEffect(() => {
    if (still || steered) return;
    const timer = setTimeout(
      () => setIndex((current) => (current + 1) % CHAPTERS.length),
      DWELL_MS,
    );
    return () => clearTimeout(timer);
  }, [index, still, steered]);

  const chapter = CHAPTERS[index];

  /*
   * Reduced motion gets every chapter at once, stacked.
   *
   * Not a frozen carousel — that would be the same content with three quarters
   * of it hidden behind controls somebody has said they do not want animated.
   * The honest version of "this rotates" for a reader who has asked for
   * stillness is "here is all of it".
   */
  if (still) {
    return (
      <div className={cn("grid gap-6", className)}>
        {CHAPTERS.map((item) => (
          <div key={item.label}>
            <Claim chapter={item} />
            <div className="pt-3">{item.preview}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* A fixed minimum height, so the column does not jump as chapters of
          different lengths replace one another. Tall enough for the longest,
          and the shorter ones simply sit in it. */}
      <div className="min-h-[7.5rem] sm:min-h-[6.5rem]">
        <AnimatePresence mode="wait">
          <motion.div
            key={chapter.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={EASE}
          >
            <Claim chapter={chapter} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="pt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={chapter.label}
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={SPRING}
          >
            {chapter.preview}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Chapters as rules rather than dots: a rule can show how far through it
          is, and a dot can only show that it is the current one. The filling
          bar is what makes the thing read as running rather than as four
          buttons that happen to change. */}
      <div
        role="tablist"
        aria-label="What Aptly does"
        className="flex items-center gap-2 pt-6"
      >
        {CHAPTERS.map((item, position) => {
          const active = position === index;
          return (
            <button
              key={item.label}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={item.label}
              onClick={() => {
                setIndex(position);
                setSteered(true);
              }}
              className="group flex-1 py-2"
            >
              <span className="relative block h-0.5 w-full overflow-hidden rounded-pill bg-hairline">
                {active && (
                  <motion.span
                    className="absolute inset-y-0 left-0 block rounded-pill bg-signal"
                    initial={{ width: steered ? "100%" : "0%" }}
                    animate={{ width: "100%" }}
                    transition={{
                      duration: steered ? 0.3 : DWELL_MS / 1000,
                      ease: "linear",
                    }}
                  />
                )}
                {!active && (
                  <span className="absolute inset-0 block rounded-pill bg-transparent transition-colors group-hover:bg-slate/30" />
                )}
              </span>
              <span className="sr-only">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Claim({ chapter }: { chapter: Chapter }) {
  return (
    <div>
      <p className="font-display text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
        {chapter.claim}
      </p>
      <p className="max-w-md pt-2 text-sm leading-relaxed text-slate">
        {chapter.detail}
      </p>
    </div>
  );
}
