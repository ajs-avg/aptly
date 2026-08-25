"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE, SPRING } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";
import type { RuleResult } from "@/lib/types";

/**
 * What this job asks for, and what your CV shows.
 *
 * Met requirements are ticked and done. Ticking an unmet one adds it — one tap,
 * no typing.
 *
 * Each row also offers a line about where the work happened, and the wording
 * around it pushes towards writing one, because the bare term is the weak
 * version of this claim in two ways. To an applicant tracking system a keyword
 * with nothing behind it reads as stuffing, which is what those systems are
 * built to catch. And in an interview it is the version with no answer behind
 * it — "ran the nightly deploy on it across three environments" survives the
 * follow-up question that "Kubernetes" does not.
 *
 * It is optional because the person owns their CV and this is their call. What
 * is not optional is that we never write the sentence for them: anything that
 * lands on the page is a word they ticked or a line they typed.
 */

export interface Claim {
  requirement: string;
  /** The term itself. What goes on the CV when no detail is given. */
  label: string;
  /** Where they used it, in their words. Never generated, never suggested. */
  evidence: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  results: RuleResult[];
  onClaim: (claims: Claim[]) => void;
  busy?: boolean;
}

export function SkillGaps({ open, onClose, results, onClaim, busy = false }: Props) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);

  const met = results.filter((r) => r.status === "covered");
  const gaps = results.filter((r) => r.status !== "covered");

  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // A ticked row with no detail contributes the term itself; with detail, the
  // sentence. Either way it is the person's own word or their own line.
  const claims: Claim[] = gaps
    .filter((row) => ticked.has(row.id))
    .map((row) => {
      const label = row.absent[0] ?? row.requirement;
      const detail = (drafts[row.id] ?? "").trim();
      return { requirement: row.requirement, label, evidence: detail || label };
    });

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
            aria-label="Skills this job asks for"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={SPRING}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-raised shadow-hero ring-1 ring-ink/10"
          >
            <div className="border-b border-hairline p-6 pb-4 sm:px-7">
              <h2 className="font-display text-lg font-semibold text-ink">
                What this job asks for
              </h2>
              <p className="pt-1.5 text-sm leading-relaxed text-slate">
                {gaps.length === 0
                  ? "Your CV shows all of it. Nothing to add."
                  : "Ticked ones are already on your CV. Tick anything else you have actually done — and say where, if you can."}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-7">
              {met.length > 0 && (
                <ul className="space-y-2 pb-5">
                  {met.map((row) => (
                    <li key={row.id} className="flex items-start gap-3">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-signal text-paper">
                        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                        </svg>
                      </span>
                      <p className="text-sm leading-snug text-slate line-through decoration-slate/30">
                        {row.requirement}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {gaps.length > 0 && (
                <>
                  <p className="pb-2.5 font-display text-2xs font-semibold uppercase tracking-[0.1em] text-amber-ink">
                    Not shown on your CV
                  </p>
                  <ul className="space-y-2">
                    {gaps.map((row) => {
                      const isOpen = openRow === row.id;
                      const draft = drafts[row.id] ?? "";
                      const ready = ticked.has(row.id);
                      const detailed = draft.trim().length >= 12;

                      return (
                        <li
                          key={row.id}
                          className={cn(
                            "rounded-lg ring-1 transition-colors",
                            ready ? "bg-signal-soft/50 ring-signal/25" : "ring-hairline",
                          )}
                        >
                          <div className="flex w-full items-start gap-3 p-3">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={ready}
                              aria-label={`I have done this: ${row.requirement}`}
                              onClick={() => {
                                toggle(row.id);
                                if (!ready) setOpenRow(row.id);
                              }}
                              // A checkbox is sized by the line of text it sits
                              // against, not by the thumb. Stretched to 44px it
                              // becomes a tall lozenge floating beside a
                              // two-line requirement — and the row beside it,
                              // which is itself a button, already gives the
                              // thumb somewhere generous to land.
                              data-tap="tight"
                              className={cn(
                                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md ring-1 transition-colors",
                                ready ? "bg-signal text-paper ring-signal" : "ring-hairline hover:ring-signal",
                              )}
                            >
                              {ready && (
                                <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                                </svg>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => setOpenRow(isOpen ? null : row.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <span className="block text-sm leading-snug text-ink">
                                {row.requirement}
                              </span>
                              <span className="block pt-0.5 text-2xs text-slate">
                                {detailed
                                  ? "with your own line"
                                  : ready
                                    ? "adds the term — say where you used it for a stronger line"
                                    : "I have done this"}
                              </span>
                            </button>
                          </div>

                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={EASE}
                                className="overflow-hidden"
                              >
                                <div className="px-3 pb-3 pl-11">
                                  <label className="block">
                                    <span className="font-display text-2xs font-medium text-ink">
                                      Where did you use it?{" "}
                                      <span className="font-normal text-slate">optional</span>
                                    </span>
                                    <textarea
                                      value={draft}
                                      autoFocus
                                      rows={2}
                                      onChange={(event) =>
                                        setDrafts((current) => ({
                                          ...current,
                                          [row.id]: event.target.value,
                                        }))
                                      }
                                      placeholder="e.g. Ran the nightly deploy on it at Kalyra, across three environments."
                                      className="mt-1.5 w-full resize-none rounded-lg bg-sunken px-3 py-2 text-[0.9375rem] leading-relaxed text-ink ring-1 ring-hairline placeholder:text-slate/55 focus:outline-none focus:ring-2 focus:ring-signal"
                                    />
                                  </label>
                                  <p className="pt-1.5 text-2xs leading-relaxed text-slate">
                                    In your own words. Leave it blank and the term goes
                                    on by itself — which an applicant tracking system
                                    reads as stuffing, and which you cannot answer a
                                    follow-up question about.
                                  </p>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline p-4 sm:px-7">
              <p className="min-w-0 flex-1 text-2xs text-slate">
                {claims.length > 0
                  ? `${claims.length} to add`
                  : gaps.length > 0
                    ? "Nothing selected"
                    : ""}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-pill px-4 font-display text-sm text-slate transition-colors hover:bg-sunken hover:text-ink"
              >
                Close
              </button>
              {claims.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onClaim(claims)}
                  className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-pill bg-signal px-4 font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover disabled:opacity-50"
                >
                  {busy ? "Adding…" : `Add ${claims.length} to my CV`}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
