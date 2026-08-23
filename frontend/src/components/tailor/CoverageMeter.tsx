"use client";

import { motion } from "motion/react";
import { cn, motionTokens } from "@/lib/utils";
import type { Coverage } from "@/lib/types";

interface Props {
  coverage: Coverage | null;
  loading: boolean;
}

/**
 * Which of the job's key terms this CV already carries.
 *
 * The design doc is specific that missing terms are "filled naturally, never
 * stuffed", so this reports and does not nag: there is no button to insert a
 * keyword. A term shows as missing because it genuinely is, and the honest
 * answers are either a real achievement that covers it or the Gap Coach.
 *
 * The number is deliberately undramatic. Rivals sell a 0–100 match score that,
 * by their own admission, does not predict a callback — leaning on it would be
 * selling the same thing.
 */
export function CoverageMeter({ coverage, loading }: Props) {
  if (loading && !coverage) {
    return (
      <div className="hairline-b px-5 py-4">
        <div className="h-1 w-full overflow-hidden rounded-full bg-sunken">
          <motion.div
            className="h-full w-1/3 rounded-full bg-hairline"
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <p className="pt-2 text-2xs text-slate">
          Checking the terms this role cares about…
        </p>
      </div>
    );
  }

  if (!coverage || coverage.matches.length === 0) return null;

  const covered = coverage.matches.filter((match) => match.covered);
  const missing = coverage.matches.filter((match) => !match.covered);
  const score = Math.round((100 * covered.length) / coverage.matches.length);

  return (
    <div className="hairline-b px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xs font-medium uppercase tracking-[0.07em] text-slate">
          Keyword coverage
        </h2>
        <span className="font-display text-sm text-ink" data-numeric>
          {covered.length}
          <span className="text-slate">/{coverage.matches.length}</span>
        </span>
      </div>

      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-sunken">
        <motion.div
          className="h-full rounded-full bg-signal"
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{
            duration: motionTokens.slow,
            ease: motionTokens.easeOut,
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {covered.map((match) => (
          <Term
            key={match.keyword}
            label={match.keyword}
            covered
            title={match.evidence_quote}
          />
        ))}
        {missing.map((match) => (
          <Term key={match.keyword} label={match.keyword} covered={false} />
        ))}
      </div>

      {missing.length > 0 && (
        <p className="pt-2.5 text-2xs leading-relaxed text-slate">
          Missing terms are shown as they are. Aptly will not insert a word you
          cannot back up.
        </p>
      )}
    </div>
  );
}

function Term({
  label,
  covered,
  title,
}: {
  label: string;
  covered: boolean;
  title?: string | null;
}) {
  return (
    <span
      title={title ?? undefined}
      className={cn(
        "rounded-xs px-1.5 py-0.5 font-display text-2xs",
        covered
          ? "bg-signal-soft text-signal"
          : "bg-sunken text-slate ring-1 ring-hairline ring-inset",
      )}
    >
      {label}
    </span>
  );
}
