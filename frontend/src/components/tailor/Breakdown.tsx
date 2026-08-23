"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE } from "@/components/motion/primitives";
import { cn } from "@/lib/utils";
import type { RuleResult, ScoreResult } from "@/lib/types";

/**
 * Every requirement, and what the score decided about it.
 *
 * A percentage on its own is unfalsifiable. Somebody who believes their CV is a
 * 90% match and is shown 63% has no way to tell whether the number is wrong or
 * they are — so the honest move is to put the working on the page and let them
 * check it line by line.
 *
 * It also makes disagreement useful. "You marked Airflow missing and it is in
 * my skills section" is a bug report; "the score feels low" is not.
 */

interface Props {
  score: ScoreResult | null;
  /** Open on arrival. True where the number is the whole point of the screen. */
  defaultOpen?: boolean;
}

export function Breakdown({ score, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  if (!score || score.results.length === 0) return null;

  const essential = score.results.filter((r) => r.essential);
  const wishes = score.results.filter((r) => !r.essential);
  const met = essential.filter((r) => r.status === "covered").length;

  return (
    <div className="mx-auto w-full max-w-lg text-left">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sunken"
      >
        <span className="flex-1 font-display text-xs font-medium text-ink">
          {/* The number that matters more than the percentage. A high score
              propped up by nice-to-haves while a stated requirement is missing
              is the application that gets rejected in six seconds. */}
          Must-haves met: {met} of {essential.length}
        </span>
        <span className="font-display text-2xs text-slate">
          {open ? "Hide" : "See every requirement"}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={cn("size-3.5 text-slate transition-transform", open && "rotate-180")}
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
            <div className="space-y-4 px-3 pb-2 pt-3">
              <Group title="What the post requires" rows={essential} />
              {wishes.length > 0 && <Group title="Nice to have — worth less" rows={wishes} />}
              <p className="text-2xs leading-relaxed text-slate">
                Aptly marks a requirement met only when it can point at the line that
                shows it. A tool that reads your CV and gives an impression will always
                score higher — it is not checking anything.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: RuleResult[] }) {
  return (
    <div>
      <p className="pb-2 font-display text-2xs font-semibold uppercase tracking-[0.1em] text-slate">
        {title}
      </p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start gap-2.5">
            <Verdict status={row.status} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-ink">{row.requirement}</p>
              {/* Which specific term was found or not. "Missing" on its own
                  invites an argument; "missing: Airflow" invites a check. */}
              {row.absent.length > 0 && (
                <p className="pt-0.5 text-2xs text-slate">not found: {row.absent.join(", ")}</p>
              )}
              {row.present.length > 0 && row.status !== "covered" && (
                <p className="pt-0.5 text-2xs text-signal">found: {row.present.join(", ")}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Verdict({ status }: { status: RuleResult["status"] }) {
  const label = { covered: "Met", partial: "Partly", missing: "Not shown" }[status];
  return (
    <span
      className={cn(
        "mt-0.5 shrink-0 rounded-pill px-2 py-0.5 font-display text-2xs font-medium",
        status === "covered" && "bg-signal-soft text-signal",
        status === "partial" && "bg-amber-soft text-amber-ink",
        status === "missing" && "bg-sunken text-slate",
      )}
    >
      {label}
    </span>
  );
}
