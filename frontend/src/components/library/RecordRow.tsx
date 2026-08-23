"use client";

import { motion } from "motion/react";
import { cn, motionTokens } from "@/lib/utils";
import { STATUS_LABEL, type RecordSummary } from "@/lib/types";

interface Props {
  record: RecordSummary;
  index: number;
  selected: boolean;
  onOpen: () => void;
}

/*
 * A row, not a card.
 *
 * The design doc asks to "open any record in seconds", and someone who has
 * applied to forty jobs is scanning, not browsing. Rows put company and role on
 * one line at a fixed rhythm, so the eye runs straight down the column instead
 * of hunting around a grid of boxes.
 */
export function RecordRow({ record, index, selected, onOpen }: Props) {
  const title = record.company ?? record.role ?? "Untitled application";
  const subtitle =
    record.company && record.role ? record.role : record.location;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: motionTokens.quick,
        ease: motionTokens.easeOut,
        delay: Math.min(index * 0.02, 0.2),
      }}
      className={cn(
        "hairline-b group grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1",
        "px-5 py-3.5 text-left transition-colors",
        selected ? "bg-signal-soft/50" : "hover:bg-sunken",
      )}
    >
      <div className="min-w-0">
        <h3 className="truncate font-display text-base font-medium text-ink">
          {title}
        </h3>
        {subtitle && (
          <p className="truncate pt-0.5 text-sm text-slate">{subtitle}</p>
        )}

        {record.keywords.length > 0 && (
          <p className="truncate pt-1.5 text-2xs text-slate/80">
            {record.keywords.slice(0, 5).join("  ·  ")}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusPill status={record.status} />
        <time className="text-2xs text-slate" data-numeric>
          {formatWhen(record.applied_at ?? record.created_at)}
        </time>
      </div>
    </motion.button>
  );
}

/*
 * Only two states get colour: a live conversation, and a closed one. Painting
 * all seven would turn the Library into a chart, and the person is looking for
 * one row, not a distribution.
 */
const LIVE = new Set(["screening", "interviewing", "offer"]);
const CLOSED = new Set(["rejected", "withdrawn"]);

function StatusPill({ status }: { status: RecordSummary["status"] }) {
  return (
    <span
      className={cn(
        "rounded-pill px-2 py-0.5 font-display text-2xs",
        LIVE.has(status)
          ? "bg-signal-soft text-signal"
          : CLOSED.has(status)
            ? "text-slate/70"
            : "text-slate",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * "5 weeks ago" rather than a date.
 *
 * The recruiter call is the moment this product is built around, and the thing
 * a person needs to orient themselves is how long ago they applied — not which
 * Tuesday it was.
 */
export function formatWhen(iso: string): string {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);

  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return then.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}
