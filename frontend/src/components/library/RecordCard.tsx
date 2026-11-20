"use client";

import { motion } from "motion/react";

import { ShapeThumbnail } from "@/components/visual/CvThumbnail";
import { cn, motionTokens } from "@/lib/utils";
import {
  STATUS_LABEL,
  VARIANT_SHORT,
  type CvVariant,
  type RecordSummary,
} from "@/lib/types";
import { formatWhen } from "./RecordRow";

/**
 * One application, as a card with the CV on it.
 *
 * The Library answered "which CV did I send?" with a filename, and a run
 * produces two documents that share one. So the card draws the document
 * instead: a person recognises their own CV by its silhouette, the way they
 * recognise a file in a Finder preview.
 *
 * The marks on it are the three things worth knowing from across the room —
 * what it scored, how far the conversation got, and whether this is the copy
 * that actually went out.
 */

const LIVE = new Set(["screening", "interviewing", "offer"]);
const CLOSED = new Set(["rejected", "withdrawn"]);

export function RecordCard({
  record,
  index,
  selected,
  onOpen,
}: {
  record: RecordSummary;
  index: number;
  selected: boolean;
  onOpen: () => void;
}) {
  const title = record.company ?? record.role ?? "Untitled application";
  const subtitle = record.company && record.role ? record.role : record.location;
  const live = LIVE.has(record.status);
  const closed = CLOSED.has(record.status);
  const sent = record.sent_variant as CvVariant | null;
  /* Two CVs and nobody has said which went out. The one thing the Library
     cannot answer, so it says so rather than picking for them. */
  const undecided = record.cv_count > 1 && !sent;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: motionTokens.base,
        ease: motionTokens.easeOut,
        delay: Math.min(index * 0.04, 0.3),
      }}
      className={cn(
        "group grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-4 rounded-2xl p-3 text-left",
        "ring-1 transition-all duration-200",
        selected
          ? "bg-signal-soft/60 shadow-lifted ring-signal/30"
          : "bg-raised shadow-raised ring-ink/[0.06] hover:-translate-y-0.5 hover:shadow-lifted",
      )}
    >
      <div className="relative w-[4.5rem] shrink-0 sm:w-[5.25rem]">
        <ShapeThumbnail shape={record.cv_shape} className="w-full" />
        {record.cv_count > 1 && (
          // The second CV, peeking out from behind the one that counts.
          <span
            aria-hidden
            className="absolute -right-1 -top-1 rounded-md bg-raised px-1.5 py-0.5 font-display text-[0.6rem] font-semibold text-slate shadow-raised ring-1 ring-ink/[0.06]"
            data-numeric
          >
            {record.cv_count}
          </span>
        )}
      </div>

      <div className="min-w-0 pt-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold tracking-[-0.015em] text-ink">
              {title}
            </h3>
            {subtitle && <p className="truncate pt-0.5 text-sm text-slate">{subtitle}</p>}
          </div>
          {record.score != null && (
            <span
              className="shrink-0 rounded-pill bg-sunken px-2 py-0.5 font-display text-2xs font-semibold text-ink"
              data-numeric
            >
              {record.score}%
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2.5">
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

          {sent && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-signal-soft px-2 py-0.5 font-display text-2xs font-medium text-signal">
              <Tick />
              Sent: {VARIANT_SHORT[sent]}
            </span>
          )}

          {undecided && (
            <span className="rounded-pill bg-amber-soft px-2 py-0.5 font-display text-2xs font-medium text-amber-ink">
              Which one did you send?
            </span>
          )}

          <time className="ml-auto shrink-0 text-2xs text-slate" data-numeric>
            {formatWhen(record.applied_at ?? record.created_at)}
          </time>
        </div>

        {record.keywords.length > 0 && (
          <p className="truncate pt-2 text-2xs text-slate/75">
            {record.keywords.slice(0, 5).join("  ·  ")}
          </p>
        )}
      </div>
    </motion.button>
  );
}

function Tick() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="4">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}
