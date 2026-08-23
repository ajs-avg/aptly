"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { cn, motionTokens } from "@/lib/utils";
import type { Change, FlagKind } from "@/lib/types";

/** Flags asking the person to verify something, rather than merely informing them. */
const NEEDS_A_DECISION: ReadonlySet<FlagKind> = new Set([
  "confirm_wording",
  "borrowed_term",
]);

interface Props {
  change: Change;
  index: number;
  onApply: () => void;
  onUndo: () => void;
  onDismiss: () => void;
  onFocus: () => void;
}

/**
 * One proposed edit.
 *
 * The anatomy is set by the design doc (p.9): section label, the current
 * wording, the suggested wording, one plain reason, and a single Apply button.
 * The literal CV text is set in mono so it reads as exact, quotable text rather
 * than as prose — you are looking at the actual characters that will change.
 *
 * Amber marks what changes; teal marks what is ready. Those are the only two
 * accent colours on this card, and each has exactly one job.
 */
export function ChangeCard({
  change,
  index,
  onApply,
  onUndo,
  onDismiss,
  onFocus,
}: Props) {
  const { suggestion, flags, status } = change;
  const applied = status === "applied";
  const stale = status === "stale";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: -24, scale: 0.98 }}
      transition={{
        duration: motionTokens.base,
        ease: motionTokens.easeOut,
        // A short stagger so a burst of cards reads as a sequence, not a flash.
        delay: Math.min(index * 0.04, 0.32),
      }}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      className={cn(
        "group rounded-xl bg-raised ring-1 transition-shadow duration-200",
        applied ? "ring-signal/25" : "ring-hairline hover:shadow-lifted",
        stale && "opacity-60",
      )}
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
        <span className="font-display text-2xs font-medium uppercase tracking-[0.07em] text-slate">
          {change.sectionTitle}
        </span>
        {suggestion.confidence === "low" && !applied && (
          <span className="font-display text-2xs text-slate">
            judgement call
          </span>
        )}
      </div>

      <div className="space-y-2 px-4 pt-2.5">
        <Line
          label="Now"
          tone="change"
          text={suggestion.before}
          muted={applied}
        />
        <Line label="Suggested" tone="ready" text={suggestion.after} />
      </div>

      <p className="px-4 pt-3 text-sm leading-relaxed text-slate">
        {suggestion.reason}
      </p>

      {flags.length > 0 && (
        <ul className="space-y-1 px-4 pt-2.5">
          {flags.map((flag) => (
            <li
              key={flag.kind}
              className={cn(
                "flex gap-2 text-2xs leading-relaxed",
                // Two different asks. Amber means "check this before you send
                // it"; slate means "here is what changed, your call".
                NEEDS_A_DECISION.has(flag.kind)
                  ? "text-amber-ink"
                  : "text-slate",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 h-1 w-1 shrink-0 rounded-full",
                  NEEDS_A_DECISION.has(flag.kind) ? "bg-amber" : "bg-slate/45",
                )}
              />
              {flag.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline px-4 py-2.5">
        <details className="min-w-0">
          <summary className="cursor-pointer font-display text-2xs text-slate transition-colors hover:text-ink">
            Where this came from
          </summary>
          <p className="cv-literal mt-2 border-l-2 border-hairline pl-2.5 text-slate">
            {suggestion.provenance.quote}
          </p>
        </details>

        {stale ? (
          <span className="font-display text-2xs text-amber-ink">
            You changed this line — dismiss and re-run
          </span>
        ) : applied ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="applied" size="sm">
              Applied
            </Button>
            <Button variant="ghost" size="sm" onClick={onUndo}>
              Undo
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              Skip
            </Button>
            <Button variant="primary" size="sm" onClick={onApply}>
              Apply
            </Button>
          </div>
        )}
      </div>
    </motion.article>
  );
}

function Line({
  label,
  tone,
  text,
  muted = false,
}: {
  label: string;
  tone: "change" | "ready";
  text: string;
  muted?: boolean;
}) {
  return (
    <div>
      <span className="font-display text-2xs uppercase tracking-[0.06em] text-slate/70">
        {label}
      </span>
      <p
        className={cn(
          "cv-literal mt-1 rounded-sm px-2.5 py-1.5",
          tone === "change"
            ? "bg-amber-soft shadow-[inset_2px_0_0_var(--color-amber)]"
            : "bg-signal-soft shadow-[inset_2px_0_0_var(--color-signal)]",
          muted && "opacity-55",
        )}
      >
        {text}
      </p>
    </div>
  );
}
