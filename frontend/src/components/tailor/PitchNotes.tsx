"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE } from "@/components/motion/primitives";
import { Balance } from "@/components/visual/primitives";
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
        {/* The balance, in the header. Somebody deciding whether to open
            this wants to know which way the call tips, not a gap count. */}
        <Balance
          strong={card.why_you_fit.length}
          gaps={card.gaps_to_own.length}
          className="hidden w-40 shrink-0 sm:block"
        />
        <span className="shrink-0 text-2xs text-slate sm:hidden" data-numeric>
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
                  <ul className="space-y-2">
                    {card.why_you_fit.map((point, index) => (
                      <li
                        key={index}
                        className="rounded-xl bg-signal-soft/50 p-3 ring-1 ring-signal/20"
                      >
                        <div className="flex gap-2.5">
                          <span
                            aria-hidden
                            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-signal text-paper"
                          >
                            <Tick />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm leading-relaxed text-ink">{point.claim}</p>
                            {/* The line on the page in front of the recruiter. A
                                claim they cannot see is one you defend from memory. */}
                            <p className="cv-literal pt-1 text-2xs leading-relaxed text-slate">
                              “{point.evidence}”
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}

              {card.gaps_to_own.length > 0 && (
                <Block title="Gaps to own" tone="amber">
                  <ul className="space-y-2">
                    {card.gaps_to_own.map((gap, index) => (
                      <li
                        key={index}
                        className="rounded-xl bg-amber-soft/60 p-3 ring-1 ring-amber/25"
                      >
                        <div className="flex gap-2.5">
                          <span
                            aria-hidden
                            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-amber/20 text-amber-ink"
                          >
                            <Bang />
                          </span>
                          <div className="min-w-0">
                            <p className="font-display text-2xs font-medium text-amber-ink">
                              {gap.requirement}
                            </p>
                            <p className="pt-1 text-sm leading-relaxed text-ink">
                              {gap.honest_answer}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}

              {card.talking_points.length > 0 && (
                <Block title="Worth saying" className="sm:col-span-2">
                  <div className="flex flex-wrap gap-1.5">
                    {card.talking_points.map((point, index) => (
                      <span
                        key={index}
                        className="rounded-pill bg-sunken px-3 py-1.5 text-2xs leading-relaxed text-ink ring-1 ring-ink/[0.05]"
                      >
                        {point}
                      </span>
                    ))}
                  </div>
                </Block>
              )}

              {card.likely_questions.length > 0 && (
                <Block title="They will probably ask">
                  <ul className="space-y-1.5">
                    {card.likely_questions.map((question, index) => (
                      <Said key={index} side="them">
                        {question}
                      </Said>
                    ))}
                  </ul>
                </Block>
              )}

              {card.ask_them.length > 0 && (
                <Block title="Worth asking back">
                  <ul className="space-y-1.5">
                    {card.ask_them.map((question, index) => (
                      <Said key={index} side="you">
                        {question}
                      </Said>
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

/**
 * A line of the call, as a bubble.
 *
 * Two lists of bare sentences do not say who is speaking, and the whole point
 * of the pair is that one set comes at you and the other goes back. Leaning
 * them opposite ways says it without a label.
 */
function Said({ children, side }: { children: React.ReactNode; side: "them" | "you" }) {
  return (
    <li
      className={cn(
        "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
        side === "them"
          ? "rounded-bl-sm bg-sunken text-ink"
          : "ml-auto rounded-br-sm bg-signal-soft text-ink",
      )}
    >
      {children}
    </li>
  );
}

function Tick() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}

function Bang() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.5">
      <path strokeLinecap="round" d="M12 7v6M12 17h.01" />
    </svg>
  );
}
