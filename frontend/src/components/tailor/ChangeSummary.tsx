"use client";

import { AnimatePresence, motion } from "motion/react";

import { EASE, SPRING } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";
import type { ScoreResult } from "@/lib/types";

/**
 * What the changes actually did — including when the answer is "not much".
 *
 * The match figure moves only when a requirement the job *names* becomes
 * present or absent. Tailoring cannot do that on its own: it rewrites what is
 * already there, and it is forbidden from adding a skill the person never
 * claimed. So the honest and common outcome is four applied changes and a score
 * that has not moved.
 *
 * Shown as a bare number, that reads as the product being broken — the person
 * did work, watched nothing happen, and concluded the score is fake. So this
 * says the thing the number cannot: the changes improved how the evidence
 * reads, and here is what would move the figure instead.
 *
 * It never claims a rise that did not happen. The one thing this product sells
 * is that its numbers are real.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  applied: number;
  score: ScoreResult | null;
  /** What the CV scored before this session's changes. */
  before: number;
}

export function ChangeSummary({ open, onClose, applied, score, before }: Props) {
  if (!score) return null;

  const moved = score.score - before;
  const missing = score.results.filter((r) => r.status === "missing");
  const essential = missing.filter((r) => r.essential);
  const covered = score.results.filter((r) => r.status === "covered").length;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={EASE}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[2px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="What these changes did"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={SPRING}
            className="fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-raised shadow-hero ring-1 ring-ink/10"
          >
            <div className="p-6 sm:p-7">
              <Verdict moved={moved} applied={applied} essential={essential.length} />

              <div className="mt-6 grid grid-cols-3 gap-3 rounded-xl bg-sunken p-4">
                <Stat label="Applied" value={applied} />
                <Stat label="Requirements met" value={`${covered}/${score.results.length}`} />
                <Stat
                  label="Match"
                  value={`${score.score}%`}
                  delta={moved === 0 ? undefined : moved}
                />
              </div>

              {/* The honest explanation of a figure that did not move. */}
              {moved === 0 && applied > 0 && (
                <p className="pt-5 text-sm leading-relaxed text-slate">
                  The score counts requirements this job <em>names</em>. Your changes
                  sharpened how your experience reads — they did not add a skill you
                  did not already have, and Aptly will never add one for you.
                </p>
              )}

              {essential.length > 0 && (
                <div className="pt-5">
                  <p className="font-display text-2xs font-semibold uppercase tracking-[0.1em] text-amber-ink">
                    What would move it
                  </p>
                  <ul className="space-y-1.5 pt-2">
                    {essential.slice(0, 4).map((item) => (
                      <li key={item.id} className="text-sm leading-relaxed text-ink">
                        {item.requirement}
                      </li>
                    ))}
                  </ul>
                  <p className="pt-2.5 text-2xs leading-relaxed text-slate">
                    If you have any of these and they are missing from your CV, add
                    them to your profile — the rebuilt version will use them. If you
                    do not have them, this is the gap to own on the call.
                  </p>
                </div>
              )}

              {essential.length === 0 && (
                <p className="pt-5 text-sm leading-relaxed text-signal">
                  Every requirement this post names is answered on your CV. There is
                  nothing left to add — the rest is how you tell it on the call.
                </p>
              )}

              <button
                type="button"
                onClick={onClose}
                className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-pill bg-ink font-display text-sm font-medium text-paper transition-colors hover:bg-ink-soft"
              >
                Back to the CV
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Verdict({
  moved,
  applied,
  essential,
}: {
  moved: number;
  applied: number;
  essential: number;
}) {
  const strong = essential === 0;

  return (
    <div>
      <div
        className={cn(
          "grid size-11 place-items-center rounded-full",
          strong ? "bg-signal-soft text-signal" : "bg-amber-soft text-amber-ink",
        )}
      >
        {strong ? <TickIcon /> : <MarkIcon />}
      </div>

      <h2 className="pt-4 font-display text-lg font-semibold text-ink">
        {applied === 0
          ? "Nothing applied yet."
          : moved > 0
            ? `${applied} change${applied === 1 ? "" : "s"} applied — up ${moved} points.`
            : `${applied} change${applied === 1 ? "" : "s"} applied.`}
      </h2>

      <p className="pt-1.5 text-sm leading-relaxed text-slate">
        {strong
          ? "Your CV already answers what this employer named. These changes make it land faster."
          : "Your wording is stronger. The score is held down by things the post asks for that are not on your CV."}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string | number;
  delta?: number;
}) {
  return (
    <div>
      <p className="font-display text-xl font-semibold text-ink" data-numeric>
        {value}
        {delta !== undefined && (
          <span
            className={cn(
              "pl-1 text-xs font-medium",
              delta > 0 ? "text-signal" : "text-danger",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </p>
      <p className="pt-0.5 font-display text-2xs uppercase tracking-[0.08em] text-slate">
        {label}
      </p>
    </div>
  );
}

function TickIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}

function MarkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path strokeLinecap="round" d="M12 8v5" />
      <circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
