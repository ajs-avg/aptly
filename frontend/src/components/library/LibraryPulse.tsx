"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { STATUS_LABEL, type RecordStatus, type RecordSummary } from "@/lib/types";

/**
 * The Library, at a glance.
 *
 * A list of forty applications answers "which one was that" and nothing else.
 * This answers the two questions somebody actually arrives with — how is the
 * search going, and what is live right now — from the records themselves, with
 * no model call and no new data.
 *
 * It holds itself to the same standard as the rest of the product: a rate is
 * only drawn when there are enough records for it to mean anything, and the
 * timeline shows real dates rather than an evenly spaced decoration.
 */

/** Anything past "applied" counts as a reply. */
const HEARD: ReadonlySet<RecordStatus> = new Set(["screening", "interviewing", "offer"]);
const CLOSED: ReadonlySet<RecordStatus> = new Set(["rejected", "withdrawn"]);

const DOT: Record<RecordStatus, string> = {
  saved: "bg-slate/35",
  applied: "bg-slate/60",
  screening: "bg-amber",
  interviewing: "bg-signal",
  offer: "bg-signal",
  rejected: "bg-danger/55",
  withdrawn: "bg-slate/25",
};

const DAY = 86_400_000;

export function LibraryPulse({
  records,
  className,
}: {
  records: RecordSummary[];
  className?: string;
}) {
  const still = useReducedMotion();

  const data = useMemo(() => {
    if (records.length === 0) return null;

    const sent = records.filter((r) => r.status !== "saved");
    const heard = records.filter((r) => HEARD.has(r.status));
    const live = records.filter((r) => HEARD.has(r.status)).length;
    const closed = records.filter((r) => CLOSED.has(r.status)).length;

    // Dated points for the strip, oldest first, positioned by real time so a
    // fortnight of silence reads as a gap rather than as one more dot.
    const dated = records
      .map((r) => ({ at: Date.parse(r.applied_at ?? r.created_at), status: r.status, label: r.company ?? r.role ?? "Application" }))
      .filter((p) => Number.isFinite(p.at))
      .sort((a, b) => a.at - b.at);

    const first = dated[0]?.at ?? 0;
    const last = dated[dated.length - 1]?.at ?? 0;
    // At least a fortnight of track, so three applications in one day do not
    // stack into a single blob at the left edge.
    const span = Math.max(last - first, 14 * DAY);

    const points = dated.map((p) => ({ ...p, x: span === 0 ? 0 : ((p.at - first) / span) * 100 }));

    const scored = (list: typeof records) => {
      const values = list.map((r) => r.score).filter((s): s is number => typeof s === "number");
      return values.length >= 2 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
    };

    return {
      total: records.length,
      sent: sent.length,
      heard: heard.length,
      live,
      closed,
      // The same guard the list below uses: one respondent is an anecdote.
      rate: sent.length >= 3 ? Math.round((heard.length / sent.length) * 100) : null,
      heardAverage: heard.length >= 2 ? scored(heard) : null,
      quietAverage: scored(records.filter((r) => !HEARD.has(r.status) && r.status !== "saved")),
      points,
      firstLabel: first ? new Date(first).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
      lastLabel: last ? new Date(last).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
    };
  }, [records]);

  if (!data) return null;

  return (
    <div className={cn("rounded-2xl bg-raised p-4 shadow-raised ring-1 ring-ink/[0.06] sm:p-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex items-end gap-5 sm:gap-7">
          <Figure value={data.total} label={data.total === 1 ? "application" : "applications"} />
          <Figure value={data.live} label="live now" tone={data.live > 0 ? "signal" : "quiet"} />
          {data.rate !== null && <Figure value={`${data.rate}%`} label="heard back" tone="ink" />}
        </div>

        {data.heardAverage !== null && data.quietAverage !== null && (
          <p className="text-2xs leading-relaxed text-slate" data-numeric>
            Replies averaged{" "}
            <span className="font-display font-semibold text-signal">{data.heardAverage}%</span> match
            {" · "}the rest {data.quietAverage}%
          </p>
        )}
      </div>

      {/* The run of applications over real time. */}
      {data.points.length > 1 && (
        <div className="pt-5">
          <div className="relative h-9">
            <div className="absolute inset-x-0 top-4 h-px bg-hairline" />
            {data.points.map((point, i) => (
              <motion.span
                key={`${point.at}-${i}`}
                className={cn(
                  "absolute top-4 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-raised",
                  DOT[point.status],
                )}
                style={{ left: `${point.x}%` }}
                title={`${point.label} · ${STATUS_LABEL[point.status]}`}
                initial={still ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.035, 0.6), ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </div>
          <div className="flex justify-between text-2xs text-slate/70">
            <span>{data.firstLabel}</span>
            <span>{data.lastLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Figure({
  value,
  label,
  tone = "ink",
}: {
  value: number | string;
  label: string;
  tone?: "ink" | "signal" | "quiet";
}) {
  return (
    <div>
      <p
        className={cn(
          "font-display text-2xl font-semibold leading-none tracking-[-0.03em]",
          tone === "signal" ? "text-signal" : tone === "quiet" ? "text-slate" : "text-ink",
        )}
        data-numeric
      >
        {value}
      </p>
      <p className="pt-1 text-2xs text-slate">{label}</p>
    </div>
  );
}
