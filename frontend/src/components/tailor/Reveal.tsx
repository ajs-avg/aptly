"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Breakdown } from "./Breakdown";
import { ScoreDial } from "./ScoreDial";
import { EASE, SPRING } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";
import type { Analysis, Fit, ScoreResult } from "@/lib/types";

/**
 * The first thing the person sees after dropping their CV.
 *
 * Reading the job, reading the CV and scoring the two against each other takes
 * around fifteen seconds, and a spinner over that is fifteen seconds of nothing.
 * This screen spends them instead: the steps name themselves as they complete,
 * and the moment the score is knowable it is shown — which is well before any
 * suggestion exists.
 *
 * The verdict beside the number is not softened. A CV that does not fit the job
 * is the single most useful thing this product can tell somebody, and it is the
 * thing every rival tool declines to say.
 */

const STEPS = [
  { key: "job", label: "Reading the job post" },
  { key: "cv", label: "Reading your CV against it" },
  { key: "score", label: "Scoring every requirement" },
  { key: "writing", label: "Writing both versions" },
] as const;

const VERDICT: Record<Fit, { headline: string; detail: string; tone: "signal" | "amber" | "danger" }> = {
  strong: {
    headline: "This is a strong fit.",
    detail: "Most of what they asked for is already here. The work now is making it unmissable.",
    tone: "signal",
  },
  workable: {
    headline: "This can work.",
    detail: "You meet a good part of the brief. Some of the evidence is buried where a reader will miss it.",
    tone: "signal",
  },
  weak: {
    headline: "This is a stretch.",
    detail:
      "Several things they treat as essential are not on your CV. Tailoring will help at the margins — it cannot close a real gap.",
    tone: "amber",
  },
  mismatch: {
    headline: "This job is asking for something else.",
    detail:
      "Nothing on your CV answers what they select on. No amount of rewording fixes that, and pretending otherwise would waste your application.",
    tone: "danger",
  },
};

interface Props {
  /** How far the run has got. */
  stage: "reading" | "working" | "ready";
  score: number | null;
  baseline: number;
  fit: Fit | null;
  analysis: Analysis | null;
  /** The per-requirement working behind the number. */
  detail?: ScoreResult | null;
  onSkip?: () => void;
  /** True while the second CV and the call sheets are still being written. */
  working?: boolean;
  /**
   * The visitor has no account. The score is theirs to see — it is the
   * argument for signing up — and the fixing is what waits behind the gate:
   * their three biggest problems, named, and one button.
   */
  locked?: boolean;
}

export function RevealScreen({
  stage,
  score,
  baseline,
  fit,
  analysis,
  detail = null,
  onSkip,
  working = false,
  locked = false,
}: Props) {
  const still = useReducedMotion();
  const reached = stage === "reading" ? 1 : stage === "working" ? 3 : 4;

  return (
    <div className="gutter mx-auto grid min-h-[70dvh] max-w-content place-items-center py-16">
      <div className="w-full max-w-2xl text-center">
        <AnimatePresence mode="wait">
          {score === null ? (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={EASE}
            >
              <p className="font-display text-2xs uppercase tracking-[0.16em] text-signal">
                Working
              </p>
              <h1 className="pt-4 font-display text-2xl font-semibold text-ink sm:text-3xl">
                Reading your CV against this job
              </h1>

              <ul className="mx-auto grid max-w-sm gap-2.5 pt-9 text-left">
                {STEPS.map((step, index) => {
                  const done = index < reached;
                  const active = index === reached;
                  return (
                    <li key={step.key} className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full ring-1 transition-colors",
                          done
                            ? "bg-signal text-paper ring-signal"
                            : active
                              ? "ring-signal"
                              : "ring-hairline",
                        )}
                      >
                        {done ? (
                          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                          </svg>
                        ) : active && !still ? (
                          <motion.span
                            className="size-1.5 rounded-full bg-signal"
                            animate={{ opacity: [1, 0.25, 1] }}
                            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                          />
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "text-base transition-colors",
                          done ? "text-ink" : active ? "text-ink" : "text-slate/60",
                        )}
                      >
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          ) : (
            <motion.div
              key="score"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING}
            >
              <p className="font-display text-2xs uppercase tracking-[0.16em] text-signal">
                Your CV, against this job
              </p>

              <div className="grid place-items-center pt-7">
                <ScoreDial value={score} size={168} label="requirements met" />
              </div>

              {fit && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...EASE, delay: 0.75 }}
                  className="pt-6"
                >
                  <h1
                    className={cn(
                      "font-display text-xl font-semibold sm:text-2xl",
                      VERDICT[fit].tone === "danger"
                        ? "text-danger"
                        : VERDICT[fit].tone === "amber"
                          ? "text-amber-ink"
                          : "text-ink",
                    )}
                  >
                    {VERDICT[fit].headline}
                  </h1>
                  <p className="mx-auto max-w-lg pt-3 text-base leading-relaxed text-slate">
                    {VERDICT[fit].detail}
                  </p>
                </motion.div>
              )}

              {analysis?.cv.positioning && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ ...EASE, delay: 1 }}
                  className="mx-auto max-w-lg pt-6 text-sm leading-relaxed text-slate"
                >
                  <span className="font-medium text-ink">How it reads now: </span>
                  {analysis.cv.positioning}
                </motion.p>
              )}

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...EASE, delay: 1.15 }}
                className="pt-7"
              >
                <Breakdown score={detail} />
              </motion.div>

              {locked && detail && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING, delay: 1.1 }}
                  className="mx-auto mt-9 max-w-md rounded-2xl bg-raised p-5 text-left shadow-float ring-1 ring-ink/5"
                >
                  <p className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-amber-ink">
                    The three costing you most
                  </p>
                  <ul className="space-y-2 pt-3">
                    {detail.results
                      .filter((gap) => gap.status !== "covered")
                      .sort((a, b) => Number(b.essential) - Number(a.essential))
                      .slice(0, 3)
                      .map((gap) => (
                        <li key={gap.requirement} className="flex gap-2.5 text-sm leading-relaxed text-ink">
                          <span
                            aria-hidden
                            className={cn(
                              "mt-1.5 inline-block size-1.5 shrink-0 rounded-full",
                              gap.status === "missing" ? "bg-danger" : "bg-amber",
                            )}
                          />
                          <span>
                            {gap.requirement}
                            {gap.essential && (
                              <span className="pl-1.5 font-display text-2xs text-danger">
                                must-have
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                  </ul>
                  <a
                    href="/sign-in?next=%2Ftailor"
                    className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-pill bg-signal px-6 font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
                  >
                    Sign up free — fix them with the agent
                  </a>
                  <p className="pt-2.5 text-center text-2xs leading-relaxed text-slate">
                    Two tailored versions, line-by-line edits, and an agent that
                    only writes what is true. Your work here is waiting on the
                    other side.
                  </p>
                </motion.div>
              )}

              {onSkip && !locked && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...SPRING, delay: 1.1 }}
                  className="pt-9"
                >
                  <button
                    type="button"
                    onClick={onSkip}
                    className="inline-flex h-11 items-center rounded-pill bg-signal px-6 font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
                  >
                    {working ? "Start working on it" : "See both versions"}
                  </button>
                  {working && (
                    <p className="pt-2.5 text-2xs text-slate">
                      The second version is still being written — it will appear
                      beside the first.
                    </p>
                  )}
                </motion.div>
              )}
              <p className="pt-3 text-2xs text-slate" data-numeric>
                Before any changes: {baseline}%
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
