"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * The check, drawn.
 *
 * "It will not invent things about you" was three paragraphs and no picture,
 * which is the wrong way round for the product's central claim: a promise
 * about what gets stopped is best made by showing something being stopped.
 *
 * Two suggestions go in. One carries a quote from the person's own CV and
 * passes. One carries a technology that appears nowhere in their material and
 * is held at the gate. The layers it passes through are the real ones, in the
 * real order, named as the validator names them.
 */

const LAYERS = ["Anchor", "Provenance", "Claims", "Deletions"] as const;

const EASE = [0.22, 1, 0.36, 1] as const;

export function ValidatorGate({ className }: { className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const seen = useInView(root, { once: true, amount: 0.4 });
  const still = useReducedMotion();
  const run = Boolean(seen || still);

  return (
    <div ref={root} className={cn("grid gap-3", className)}>
      <Row
        kind="pass"
        text="Built the pricing dashboard, writing the SQL that pulls from PostgreSQL."
        note="Quoted from your CV, line 14."
        run={run}
        still={Boolean(still)}
        delay={0}
      />
      <Gate run={run} still={Boolean(still)} />
      <Row
        kind="blocked"
        text="Rebuilt the ingestion pipeline and deployed it on Kubernetes."
        note="Kubernetes is not in your CV. Discarded before you saw it."
        run={run}
        still={Boolean(still)}
        delay={0.5}
      />
    </div>
  );
}

function Row({
  kind,
  text,
  note,
  run,
  still,
  delay,
}: {
  kind: "pass" | "blocked";
  text: string;
  note: string;
  run: boolean;
  still: boolean;
  delay: number;
}) {
  const blocked = kind === "blocked";
  return (
    <motion.div
      initial={still ? false : { opacity: 0, x: blocked ? -14 : 14 }}
      animate={run ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.6, ease: EASE, delay }}
      className={cn(
        "rounded-2xl p-3 ring-1",
        blocked ? "bg-danger-soft ring-danger/25" : "bg-signal-soft ring-signal/25",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
            blocked ? "bg-danger/15 text-danger" : "bg-signal text-paper",
          )}
        >
          {blocked ? <Cross /> : <Tick />}
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              "font-mono text-xs leading-relaxed",
              blocked ? "text-danger/80 line-through decoration-danger/40" : "text-ink",
            )}
          >
            {text}
          </p>
          <p className="pt-1 text-2xs leading-relaxed text-slate">{note}</p>
        </div>
      </div>
    </motion.div>
  );
}

/** The layers themselves, lighting in order as the check runs. */
function Gate({ run, still }: { run: boolean; still: boolean }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="shrink-0 font-display text-2xs font-medium uppercase tracking-[0.12em] text-slate">
        7 checks
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {LAYERS.map((layer, i) => (
          <motion.span
            key={layer}
            initial={still ? false : { opacity: 0.25, scaleY: 0.6 }}
            animate={run ? { opacity: 1, scaleY: 1 } : {}}
            transition={{ duration: 0.3, ease: EASE, delay: 0.18 + i * 0.09 }}
            className="h-6 min-w-0 flex-1 rounded-md bg-ink/[0.06] ring-1 ring-ink/[0.06]"
            title={layer}
          >
            <span className="grid h-full place-items-center truncate px-1 text-[0.58rem] text-slate">
              {layer}
            </span>
          </motion.span>
        ))}
        <span className="shrink-0 text-[0.58rem] text-slate/70">+3</span>
      </div>
    </div>
  );
}

function Tick() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}

function Cross() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="4">
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
