"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";

import { Pips } from "@/components/visual/primitives";
import { EASE, SPRING } from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { InterviewPrep, InterviewQuestion } from "@/lib/types";

/**
 * The preparation sheet, as cards you work through rather than a page you
 * scroll.
 *
 * A typical sheet is eight to ten questions, each with a reason and three or
 * four answer points. Stacked, that is sixty to a hundred sentences in one
 * column — which is a document, and nobody rehearses from a document. One
 * question at a time is how a person actually practises, and it turns a wall
 * of text into something with a position in it: this one of nine, these
 * rehearsed, that one still ahead.
 *
 * The answer is hidden until asked for, because reading a question with its
 * answer already in view is not rehearsal.
 */

const KIND: Record<InterviewQuestion["kind"], { label: string; tone: string; dot: string }> = {
  requirement: { label: "From the post", tone: "bg-signal-soft text-signal", dot: "bg-signal" },
  cv: { label: "About your CV", tone: "bg-sunken text-slate", dot: "bg-slate" },
  gap: { label: "Where you may be pushed", tone: "bg-amber-soft text-amber-ink", dot: "bg-amber" },
};

export function PrepDeck({ prep }: { prep: InterviewPrep }) {
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  /** Which cards have been turned over at least once. */
  const [rehearsed, setRehearsed] = useState<Set<number>>(new Set());

  const questions = prep.questions;
  const counts = useMemo(() => {
    const tally = { requirement: 0, cv: 0, gap: 0 };
    for (const question of questions) tally[question.kind] += 1;
    return tally;
  }, [questions]);

  if (questions.length === 0) return null;
  const question = questions[Math.min(at, questions.length - 1)];
  const kind = KIND[question.kind];

  const go = (next: number) => {
    setAt(Math.max(0, Math.min(questions.length - 1, next)));
    setOpen(false);
  };

  const reveal = () => {
    setOpen(true);
    setRehearsed((current) => new Set(current).add(at));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The opener is not a question and does not belong in the deck: it is
          the first thing said, every time. */}
      <div className="rounded-2xl bg-signal-soft/60 p-3.5">
        <p className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-signal">
          Your opener
        </p>
        <p className="pt-1.5 text-sm leading-relaxed text-ink">{prep.opener}</p>
      </div>

      {/* What is in the deck, before working through it. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
        {(Object.keys(KIND) as Array<InterviewQuestion["kind"]>).map((key) =>
          counts[key] > 0 ? (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-1.5 rounded-full", KIND[key].dot)} />
              <span className="text-2xs text-slate">
                <span className="font-display font-semibold text-ink" data-numeric>
                  {counts[key]}
                </span>{" "}
                {KIND[key].label.toLowerCase()}
              </span>
            </span>
          ) : null,
        )}
        <span className="ml-auto inline-flex items-center gap-2">
          <Pips filled={rehearsed.size} total={questions.length} />
          <span className="text-2xs text-slate" data-numeric>
            {rehearsed.size} of {questions.length} rehearsed
          </span>
        </span>
      </div>

      {/* The card. */}
      <div className="relative min-h-0 flex-1 pt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={at}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={SPRING}
            className={cn(
              "flex h-full flex-col rounded-2xl p-5 ring-1",
              question.kind === "gap"
                ? "bg-amber-soft/40 ring-amber/25"
                : "bg-sunken ring-ink/[0.06]",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  "rounded-pill px-2.5 py-1 font-display text-2xs font-medium",
                  kind.tone,
                )}
              >
                {kind.label}
              </span>
              <span className="font-display text-2xs text-slate" data-numeric>
                {at + 1} / {questions.length}
              </span>
            </div>

            <p className="pt-4 font-display text-lg font-semibold leading-snug tracking-[-0.02em] text-ink">
              &ldquo;{question.question}&rdquo;
            </p>
            <p className="pt-2 text-2xs leading-relaxed text-slate">{question.why}</p>

            <div className="min-h-0 flex-1 pt-4">
              <AnimatePresence initial={false} mode="wait">
                {open ? (
                  <motion.ul
                    key="answer"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={EASE}
                    className="space-y-2"
                  >
                    {question.answer_points.map((point, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...EASE, delay: i * 0.06 }}
                        className="flex gap-2.5 rounded-xl bg-raised px-3 py-2.5 text-sm leading-relaxed text-ink ring-1 ring-ink/[0.05]"
                      >
                        <span
                          aria-hidden
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-signal"
                        />
                        <span>{point}</span>
                      </motion.li>
                    ))}
                  </motion.ul>
                ) : (
                  <motion.button
                    key="prompt"
                    type="button"
                    onClick={reveal}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="group grid w-full place-items-center rounded-xl border border-dashed border-ink/15 py-7 transition-colors hover:border-signal/40 hover:bg-raised/60"
                  >
                    <span className="font-display text-sm text-slate transition-colors group-hover:text-signal">
                      Answer it out loud, then check
                    </span>
                    <span className="pt-1 text-2xs text-slate/70">
                      {question.answer_points.length} points from your own material
                    </span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-2 pt-4">
        <Button variant="ghost" size="sm" onClick={() => go(at - 1)} disabled={at === 0}>
          ← Back
        </Button>

        {/* Every card, as a row of marks: where you are, what you have turned
            over, and how much is left. */}
        <div className="flex flex-1 justify-center gap-1">
          {questions.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Question ${i + 1}`}
              aria-current={i === at}
              data-tap="tight"
              className="group px-0.5 py-2"
            >
              <span
                className={cn(
                  "block h-1.5 w-4 rounded-pill transition-colors",
                  i === at
                    ? "bg-ink"
                    : rehearsed.has(i)
                      ? KIND[item.kind].dot
                      : "bg-ink/15 group-hover:bg-ink/30",
                )}
              />
            </button>
          ))}
        </div>

        <Button
          variant={at === questions.length - 1 ? "secondary" : "primary"}
          size="sm"
          onClick={() => go(at + 1)}
          disabled={at === questions.length - 1}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
