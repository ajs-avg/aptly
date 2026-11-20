"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * The shapes the product counts in.
 *
 * Every one of these replaces a sentence that was carrying a number. "Must-
 * haves met: 4 of 9" is nine pips with four filled; "saved · applied ·
 * screening" is a pipeline with one stage lit; "53% · was 34%" is two bars on
 * one axis. The rule is the same each time: if the underlying thing is a
 * proportion, a position or a comparison, it gets drawn.
 *
 * Small, unopinionated and theme-token only, so the same shape reads correctly
 * in the app, in a dialog, and on the landing page.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

/* ── Pips: a small count, shown rather than written ───────────────────────── */

export function Pips({
  filled,
  total,
  tone = "signal",
  className,
}: {
  filled: number;
  total: number;
  tone?: "signal" | "amber";
  className?: string;
}) {
  const still = useReducedMotion();
  // Past a dozen the pips stop being countable and become texture, which is a
  // bar's job rather than this one's.
  if (total > 14) return <Meter value={filled} total={total} tone={tone} className={className} />;

  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)} aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <motion.span
          key={i}
          initial={still ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE, delay: i * 0.035 }}
          className={cn(
            "block size-[5px] rounded-full",
            i < filled
              ? tone === "amber"
                ? "bg-amber"
                : "bg-signal"
              : "bg-ink/15",
          )}
        />
      ))}
    </span>
  );
}

/** The same proportion, as a bar, for counts too large to pip. */
export function Meter({
  value,
  total,
  tone = "signal",
  className,
}: {
  value: number;
  total: number;
  tone?: "signal" | "amber" | "danger";
  className?: string;
}) {
  const still = useReducedMotion();
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <span
      aria-hidden
      className={cn("block h-1.5 w-full overflow-hidden rounded-pill bg-ink/[0.08]", className)}
    >
      <motion.span
        className={cn(
          "block h-full rounded-pill",
          tone === "amber" ? "bg-amber" : tone === "danger" ? "bg-danger" : "bg-signal",
        )}
        initial={still ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: EASE }}
      />
    </span>
  );
}

/* ── Two numbers on one axis ──────────────────────────────────────────────── */

/**
 * A head-to-head, drawn.
 *
 * Two scores written as "53%" and "41%" ask the reader to subtract. Two bars
 * on a shared axis, with the baseline marked, answer "which is ahead and by
 * how much" without arithmetic.
 */
export function CompareBars({
  rows,
  baseline,
  className,
}: {
  rows: Array<{ label: string; value: number; tone?: "signal" | "amber"; active?: boolean }>;
  /** Where it started, as a line across both. */
  baseline?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  return (
    <div className={cn("relative grid gap-2", className)}>
      {baseline !== undefined && baseline > 0 && (
        <span
          aria-hidden
          className="absolute inset-y-0 z-10 w-px bg-slate/40"
          style={{ left: `${Math.min(100, baseline)}%` }}
        />
      )}
      {rows.map((row, i) => (
        <div key={row.label} className="relative">
          <div className="flex items-baseline justify-between gap-2 pb-1">
            <span
              className={cn(
                "truncate font-display text-2xs",
                row.active ? "font-semibold text-ink" : "text-slate",
              )}
            >
              {row.label}
            </span>
            <span
              className={cn(
                "shrink-0 font-display text-2xs font-semibold",
                row.tone === "amber" ? "text-amber-ink" : "text-signal",
              )}
              data-numeric
            >
              {row.value}%
            </span>
          </div>
          <span className="block h-2 w-full overflow-hidden rounded-pill bg-ink/[0.07]">
            <motion.span
              className={cn(
                "block h-full rounded-pill",
                row.tone === "amber" ? "bg-amber" : "bg-signal",
                !row.active && "opacity-55",
              )}
              initial={still ? false : { width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, row.value))}%` }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── A position in a pipeline ─────────────────────────────────────────────── */

/**
 * Where this application stands.
 *
 * The statuses are a funnel — saved, applied, screening, interviewing, offer —
 * and were drawn as a row of identical pills, which says nothing about order
 * or progress. This draws the ladder and lights what has been reached.
 *
 * Rejected and withdrawn are not stages of it: they are how it ended, so they
 * sit outside the track rather than pretending to be a step along it.
 */
export function Pipeline({
  stages,
  current,
  onPick,
  className,
}: {
  stages: Array<{ value: string; label: string }>;
  current: string;
  onPick?: (value: string) => void;
  className?: string;
}) {
  const index = stages.findIndex((stage) => stage.value === current);
  const still = useReducedMotion();

  return (
    <div className={cn("flex items-stretch gap-1", className)}>
      {stages.map((stage, i) => {
        const reached = index >= 0 && i <= index;
        const here = i === index;
        const Tag = onPick ? "button" : "div";
        return (
          <Tag
            key={stage.value}
            {...(onPick
              ? { type: "button" as const, onClick: () => onPick(stage.value), "aria-current": here }
              : {})}
            className={cn(
              "group relative min-w-0 flex-1 text-left",
              onPick && "cursor-pointer",
            )}
            title={stage.label}
          >
            <motion.span
              aria-hidden
              className={cn(
                "block h-1.5 rounded-pill transition-colors",
                reached ? "bg-signal" : "bg-ink/[0.1]",
                here && "ring-2 ring-signal/30",
              )}
              initial={still ? false : { scaleX: 0.3, originX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.35, ease: EASE, delay: i * 0.05 }}
            />
            <span
              className={cn(
                "mt-1.5 block truncate font-display text-[0.6rem] transition-colors",
                here ? "font-semibold text-ink" : reached ? "text-slate" : "text-slate/55",
                onPick && "group-hover:text-ink",
              )}
            >
              {stage.label}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

/* ── Strengths against gaps ───────────────────────────────────────────────── */

/**
 * What you can prove, against what you cannot.
 *
 * The call sheet listed both as two headings and two bulleted lists, which
 * reads as two separate facts. They are one fact — a balance — and somebody
 * about to be asked about it should see which way it tips before they read a
 * word.
 */
export function Balance({
  strong,
  gaps,
  className,
}: {
  strong: number;
  gaps: number;
  className?: string;
}) {
  const still = useReducedMotion();
  const total = Math.max(1, strong + gaps);
  const share = (strong / total) * 100;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-baseline justify-between pb-1.5">
        <span className="font-display text-2xs font-medium text-signal" data-numeric>
          {strong} you can prove
        </span>
        <span className="font-display text-2xs font-medium text-amber-ink" data-numeric>
          {gaps} to own
        </span>
      </div>
      <span aria-hidden className="flex h-2 w-full gap-0.5 overflow-hidden rounded-pill">
        <motion.span
          className="block h-full rounded-l-pill bg-signal"
          initial={still ? false : { width: "50%" }}
          animate={{ width: `${share}%` }}
          transition={{ duration: 0.7, ease: EASE }}
        />
        <motion.span
          className="block h-full flex-1 rounded-r-pill bg-amber"
          initial={false}
        />
      </span>
    </div>
  );
}

/* ── A document, with the changed lines marked ────────────────────────────── */

export type MarkKind = "rewrite" | "add" | "remove" | "move";

const MARK: Record<MarkKind, string> = {
  rewrite: "bg-signal",
  add: "bg-signal",
  remove: "bg-danger",
  move: "bg-amber",
};

/**
 * Where an edit lands, before you read it.
 *
 * Twenty proposed changes is twenty text blocks and no sense of scale. This
 * draws the document as a column of lines and stripes the ones being touched,
 * so "how big is this, and does it hit my experience or my skills" is a
 * glance.
 */
export function DocumentMap({
  lines,
  marks,
  className,
}: {
  /** How many lines the document has. */
  lines: number;
  /** Zero-based line indices being touched, with what is happening to them. */
  marks: Array<{ at: number; kind: MarkKind }>;
  className?: string;
}) {
  const still = useReducedMotion();
  const count = Math.max(1, Math.min(lines, 40));
  const byLine = new Map(marks.map((mark) => [Math.min(mark.at, count - 1), mark.kind]));

  return (
    <div
      aria-hidden
      className={cn(
        "flex aspect-[1/1.3] flex-col justify-start gap-[2.5%] rounded-lg bg-raised p-[8%] ring-1 ring-ink/[0.08]",
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => {
        const kind = byLine.get(i);
        return (
          <motion.span
            key={i}
            className={cn(
              "block h-[2%] shrink-0 rounded-[1px]",
              kind ? MARK[kind] : "bg-hairline",
            )}
            style={{ width: `${kind ? 92 : 45 + ((i * 37) % 50)}%` }}
            initial={still || !kind ? false : { opacity: 0.2, scaleX: 0.5, originX: 0 }}
            animate={kind ? { opacity: 1, scaleX: 1 } : {}}
            transition={{ duration: 0.35, ease: EASE, delay: 0.1 + i * 0.02 }}
          />
        );
      })}
    </div>
  );
}

/* ── Severity, as three segments ──────────────────────────────────────────── */

export function Severity({
  errors,
  warnings,
  polish,
  className,
}: {
  errors: number;
  warnings: number;
  polish: number;
  className?: string;
}) {
  const total = Math.max(1, errors + warnings + polish);
  const bars: Array<[number, string]> = [
    [errors, "bg-danger"],
    [warnings, "bg-amber"],
    [polish, "bg-slate/40"],
  ];
  return (
    <span aria-hidden className={cn("flex h-1.5 w-full gap-0.5 overflow-hidden rounded-pill", className)}>
      {bars.map(([n, tone], i) =>
        n > 0 ? (
          <span key={i} className={cn("block h-full rounded-pill", tone)} style={{ width: `${(n / total) * 100}%` }} />
        ) : null,
      )}
      {errors + warnings + polish === 0 && (
        <span className="block h-full w-full rounded-pill bg-signal" />
      )}
    </span>
  );
}
