"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";
import type { PitchCard } from "@/lib/types";

/**
 * What to say when they call, for the version you are about to send.
 *
 * Sits under whichever panel is open, because the two CVs make different cases
 * and each deserves its own answer to "tell me about yourself". Collapsed by
 * default: it matters at the call, not while editing.
 *
 * The gaps are not an appendix. Every rival tool lists strengths and stops, and
 * the person then gets asked about the one thing they cannot do with nothing
 * prepared. Here they open expanded and are worded to be said out loud.
 */

export function PitchNotes({ card }: { card: PitchCard }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-2xl bg-raised shadow-float ring-1 ring-ink/5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-sunken/50 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-semibold text-ink">
            When they call about this one
          </h2>
          <p className="truncate pt-0.5 text-2xs text-slate">
            {card.one_liner || "Your opening answer, the fit points, and the gaps to own."}
          </p>
        </div>
        <span className="shrink-0 text-2xs text-slate" data-numeric>
          {card.gaps_to_own.length} gap{card.gaps_to_own.length === 1 ? "" : "s"}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={cn("size-4 shrink-0 text-slate transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EASE}
            className="overflow-hidden"
          >
            <div className="grid gap-5 border-t border-hairline p-4 sm:grid-cols-2 sm:p-5">
              {card.one_liner && (
                <Block title="Tell me about yourself" className="sm:col-span-2">
                  <p className="text-sm leading-relaxed text-ink">{card.one_liner}</p>
                </Block>
              )}

              {card.why_you_fit.length > 0 && (
                <Block title="Why you fit">
                  <ul className="space-y-2.5">
                    {card.why_you_fit.map((point, index) => (
                      <li key={index}>
                        <p className="text-sm leading-relaxed text-ink">{point.claim}</p>
                        {/* The line on the page in front of the recruiter. A
                            claim they cannot see is one you defend from memory. */}
                        <p className="cv-literal pt-0.5 text-2xs text-slate">
                          “{point.evidence}”
                        </p>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}

              {card.gaps_to_own.length > 0 && (
                <Block title="Gaps to own" tone="amber">
                  <ul className="space-y-2.5">
                    {card.gaps_to_own.map((gap, index) => (
                      <li key={index}>
                        <p className="font-display text-2xs font-medium text-amber-ink">
                          {gap.requirement}
                        </p>
                        <p className="pt-0.5 text-sm leading-relaxed text-ink">
                          {gap.honest_answer}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}

              {card.likely_questions.length > 0 && (
                <Block title="They will probably ask">
                  <ul className="space-y-1.5">
                    {card.likely_questions.map((question, index) => (
                      <li key={index} className="text-sm leading-relaxed text-ink">
                        {question}
                      </li>
                    ))}
                  </ul>
                </Block>
              )}

              {card.ask_them.length > 0 && (
                <Block title="Worth asking back">
                  <ul className="space-y-1.5">
                    {card.ask_them.map((question, index) => (
                      <li key={index} className="text-sm leading-relaxed text-ink">
                        {question}
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Block({
  title,
  children,
  tone = "signal",
  className,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "signal" | "amber";
  className?: string;
}) {
  return (
    <div className={className}>
      <h3
        className={cn(
          "pb-2 font-display text-2xs font-semibold uppercase tracking-[0.1em]",
          tone === "amber" ? "text-amber-ink" : "text-signal",
        )}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}
