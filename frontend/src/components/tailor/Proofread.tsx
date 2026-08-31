"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE } from "@/components/motion/primitives";
import { proofreadCv } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CVDocument, FindingSeverity, ProofreadResponse } from "@/lib/types";

/**
 * What is mechanically wrong with this CV, before it is sent.
 *
 * Runs on the document as it stands, on both versions, and re-runs as it is
 * edited — which it can afford to do because nothing here is a model call.
 * Every check is deterministic and takes about a millisecond, so this costs
 * nothing and, more usefully, cannot invent a problem that is not there.
 *
 * That last property is what makes it worth putting on screen at all. A
 * checker that is occasionally wrong is one people learn to dismiss, and a
 * dismissed checker catches nothing — so the honest version of this feature is
 * a short list of certainties rather than a long list of maybes.
 *
 * Collapsed by default once there is nothing serious, because "no errors" is
 * the answer somebody wants and a panel of polish notes is not what they came
 * for. Errors open it themselves.
 */
export function Proofread({ document }: { document: CVDocument | null }) {
  const [result, setResult] = useState<ProofreadResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!document) return;
    let live = true;

    // Debounced, because this re-runs on every applied change and every
    // keystroke in the editor. The check itself is cheap; the round trip is
    // not free.
    const timer = setTimeout(() => {
      void proofreadCv(document)
        .then((next) => {
          if (!live) return;
          setResult(next);
          // Something actually wrong opens the panel itself. Polish does not:
          // a list of double spaces demanding attention is how the whole thing
          // gets ignored.
          if (next.errors > 0) setOpen(true);
        })
        .catch(() => {
          // A proofreading pass that could not run is not worth an error
          // message. The CV is unaffected and the person has not asked for it.
        });
    }, 700);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [document]);

  if (!result) return null;

  const total = result.findings.length;
  const serious = result.errors + result.warnings;

  return (
    <div className="border-t border-hairline">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-sunken/50 sm:px-5"
      >
        <Dot severity={result.errors ? "error" : result.warnings ? "warning" : "polish"} clean={total === 0} />

        <span className="min-w-0 flex-1">
          <span className="block font-display text-xs font-medium text-ink">
            {total === 0
              ? "Nothing to fix"
              : serious > 0
                ? `${serious} thing${serious === 1 ? "" : "s"} to fix before you send this`
                : `${total} small thing${total === 1 ? "" : "s"}`}
          </span>
          {total === 0 && (
            <span className="block pt-0.5 text-2xs text-slate">
              Dates, contact details, spacing and repeated words all check out.
            </span>
          )}
        </span>

        {total > 0 && (
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className={cn("size-3.5 shrink-0 text-slate transition-transform", open && "rotate-90")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
          </svg>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && total > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EASE}
            className="overflow-hidden"
          >
            <ul className="space-y-2.5 px-4 pb-4 sm:px-5">
              {result.findings.map((finding, index) => (
                <li key={`${finding.kind}-${index}`} className="flex items-start gap-2.5">
                  <Dot severity={finding.severity} />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug text-ink">{finding.message}</p>
                    <p className="pt-0.5 text-2xs leading-relaxed text-slate">{finding.hint}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Severity as one dot.
 *
 * Colour alone would not be enough, so the three also differ in size and the
 * text beside every one of them says what it is. The dot is the glance; the
 * sentence is the answer.
 */
function Dot({ severity, clean = false }: { severity: FindingSeverity; clean?: boolean }) {
  if (clean) {
    return (
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="mt-0.5 size-3.5 shrink-0 text-signal"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 8.5l3.5 3.5 7.5-8" />
      </svg>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 shrink-0 rounded-full",
        severity === "error"
          ? "size-2 bg-danger"
          : severity === "warning"
            ? "size-2 bg-amber"
            : "size-1.5 bg-slate/40",
      )}
    />
  );
}
