"use client";

import { motion, useReducedMotion } from "motion/react";

import { PaperLines } from "@/components/visual/Paper";
import { ScoreRing } from "@/components/visual/ScoreRing";
import { formatWhen } from "@/lib/when";
import { cn, motionTokens } from "@/lib/utils";
import { STATUS_LABEL, VARIANT_SHORT, type CvVariant, type RecordSummary } from "@/lib/types";

/**
 * One application on the shelf: the CV that went out, as a sheet of paper.
 *
 * The thing that tells two applications apart is the document on each, so the
 * document is the card. Under it, the four facts a person reaches for when a
 * recruiter calls: who, for what, how well it matched, where it stands.
 */

const LIVE = new Set(["screening", "interviewing", "offer"]);
const CLOSED = new Set(["rejected", "withdrawn"]);

export function ShelfCard({
  record,
  index,
  onOpen,
  ghost = false,
}: {
  record: RecordSummary;
  index: number;
  onOpen?: () => void;
  /** A sample, drawn faded: the shape of what the shelf will hold. */
  ghost?: boolean;
}) {
  const still = useReducedMotion();
  const title = record.company ?? record.role ?? "Untitled application";
  const subtitle = record.company && record.role ? record.role : record.location;
  const live = LIVE.has(record.status);
  const closed = CLOSED.has(record.status);
  const sent = record.sent_variant as CvVariant | null;
  /* Two CVs and nobody has said which went out — the one thing the Library
     cannot answer, so it asks rather than guessing. */
  const undecided = record.cv_count > 1 && !sent;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      disabled={ghost}
      initial={still ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: motionTokens.slow,
        ease: motionTokens.easeOut,
        delay: Math.min(index * 0.05, 0.35),
      }}
      className={cn(
        "group block w-full text-left",
        ghost ? "pointer-events-none" : "cursor-pointer",
      )}
    >
      {/* The sheet, lifted off the desk when looked at. */}
      <div className="relative [perspective:1200px]">
        {record.cv_count > 1 && (
          // The second CV, filed behind the one that counts.
          <div
            aria-hidden
            className="absolute inset-0 translate-x-1.5 translate-y-1.5 rotate-[1.6deg] rounded-[2.5cqw] bg-sunken ring-1 ring-hairline"
          />
        )}
        <div
          className={cn(
            "relative transition-transform duration-500 [transform-style:preserve-3d]",
            !ghost && !still && "group-hover:[transform:translateY(-6px)_rotateX(2.5deg)]",
          )}
        >
          <PaperLines
            lines={record.cv_shape}
            muted={ghost}
            className={cn(
              "w-full shadow-float transition-shadow duration-500",
              !ghost && "group-hover:shadow-hero",
            )}
          />

          {sent && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-pill bg-signal px-2 py-0.5 font-display text-[10px] font-medium text-paper shadow-cta">
              <Tick />
              Sent · {VARIANT_SHORT[sent]}
            </span>
          )}
          {undecided && (
            <span className="absolute right-2 top-2 rounded-pill bg-amber px-2 py-0.5 font-display text-[10px] font-medium text-paper">
              Which one did you send?
            </span>
          )}
          {record.cv_count > 1 && (
            <span
              className="absolute bottom-2 right-2 rounded-md bg-raised/90 px-1.5 py-0.5 font-display text-[10px] font-medium text-slate ring-1 ring-hairline backdrop-blur"
              data-numeric
            >
              {record.cv_count} versions
            </span>
          )}
          {ghost && (
            <span className="absolute bottom-2 left-2 rounded-pill bg-sunken px-2 py-0.5 font-display text-[10px] font-medium uppercase tracking-[0.08em] text-slate ring-1 ring-hairline">
              Example
            </span>
          )}
        </div>
      </div>

      <div className={cn("pt-3.5", ghost && "opacity-60")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-sm font-medium tracking-[-0.01em] text-ink">
              {title}
            </h3>
            {subtitle && <p className="truncate pt-0.5 text-xs text-slate">{subtitle}</p>}
          </div>
          {record.score != null && (
            <ScoreRing value={record.score} size={34} instant />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <span
            className={cn(
              "rounded-pill px-2 py-0.5 font-display text-2xs font-medium",
              live
                ? "bg-signal-soft text-signal"
                : closed
                  ? "bg-sunken text-slate/70"
                  : "bg-sunken text-slate",
            )}
          >
            {STATUS_LABEL[record.status]}
          </span>
          <time className="ml-auto shrink-0 text-2xs text-slate" data-numeric>
            {formatWhen(record.applied_at ?? record.created_at)}
          </time>
        </div>

        {record.keywords.length > 0 && (
          <p className="truncate pt-1.5 text-2xs text-slate/70">
            {record.keywords.slice(0, 4).join("  ·  ")}
          </p>
        )}
      </div>
    </motion.button>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}
