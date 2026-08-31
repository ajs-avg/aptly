"use client";

import { useState } from "react";
import { motion } from "motion/react";

import { ChangeSummary } from "./ChangeSummary";
import { ScoreDial } from "./ScoreDial";
import { SkillGaps } from "./SkillGaps";
import { EditableCv } from "./EditableCv";
import { DownloadDialog } from "./DownloadDialog";
import { Proofread } from "./Proofread";
import { SPRING } from "@/components/motion/primitives";
import { useMediaQuery } from "@/lib/browser";
import { cn } from "@/lib/utils";
import type { ScoreResult, TargetFormat } from "@/lib/types";
import type { Side, SideState } from "@/lib/useTailorRun";

/**
 * One of the two answers, and everything you can do to it.
 *
 * The same component renders both sides. They differ in what produced them —
 * one is the person's file edited, the other a document written from scratch —
 * and in nothing else about how they are worked with: both are read, edited,
 * scored and approved identically. Two components would have drifted into two
 * slightly different editors, and the whole screen is a comparison.
 *
 * Collapsed, a panel is a summary you can compare at a glance. Expanded, it is
 * the working surface. Clicking anywhere in the header switches, because on a
 * comparison screen the thing you want after deciding is the other one open.
 */


interface Props {
  side: Side;
  title: string;
  blurb: string;
  state: SideState;
  score: ScoreResult | null;
  baseline: number;
  expanded: boolean;
  /** Null while the other panel is expanded and this one is hidden. */
  onExpand: () => void;
  onCollapse: () => void;
  onApply: (nodeId: string) => void;
  onUndo: (nodeId: string, previousText: string) => void;
  onDismiss: (nodeId: string) => void;
  onApplyAll: () => void;
  onEdit: (nodeId: string, text: string) => void;
  onApprove: () => void;
  onDownload: (format: TargetFormat, template: string | null) => void;
  sourceFormat: string;
  /** Whether there is an uploaded file whose formatting could be kept. */
  canKeepFormat: boolean;
  busy?: boolean;
  /** Ask the server to read the edited document again. */
  onRecheck?: () => void;
  rechecking?: boolean;
  /** What that full re-read said, once it has run. */
  verified?: { score: number; essentialMet: number; essentialTotal: number } | null;
  /** Lines the person wrote about work missing from their CV. */
  onClaim?: (lines: string[]) => void;
}

export function CvPanel({
  side,
  title,
  blurb,
  state,
  score,
  baseline,
  expanded,
  onExpand,
  onCollapse,
  onApply,
  onUndo,
  onDismiss,
  onApplyAll,
  onEdit,
  onApprove,
  onDownload,
  sourceFormat,
  canKeepFormat,
  busy = false,
  onRecheck,
  rechecking = false,
  verified = null,
  onClaim,
}: Props) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [gapsOpen, setGapsOpen] = useState(false);

  /*
   * The dial is drawn to a pixel size, so it cannot be told to shrink in CSS
   * the way everything beside it can — an SVG with width and height attributes
   * ignores the column it is in and takes what it was given.
   *
   * At 96px it takes a third of the width of a 320px phone, and the title and
   * blurb it sits next to are left with 176px, in which "Your CV, tailored"
   * wraps to three lines beside a number that had room to spare. Measuring the
   * window and handing it a smaller number is the only lever there is.
   */
  const tight = useMediaQuery("(width < 30rem)");
  const dialSize = tight ? 66 : expanded ? 96 : 84;
  const pending = state.changes.filter((change) => change.status === "pending").length;
  const applied = state.changes.filter((change) => change.status === "applied").length;

  return (
    <motion.section
      layout
      transition={SPRING}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl bg-raised ring-1 ring-ink/5",
        expanded ? "shadow-hero" : "shadow-float",
      )}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header
        className={cn(
          "flex items-start gap-4 border-b border-hairline p-4 sm:p-5",
          !expanded && "cursor-pointer transition-colors hover:bg-sunken/50",
        )}
        onClick={!expanded ? onExpand : undefined}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                side === "rebuilt" ? "bg-amber" : "bg-signal",
              )}
            />
            <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>
            {state.approved && (
              <span className="rounded-pill bg-signal-soft px-2 py-0.5 font-display text-2xs font-medium text-signal">
                Approved
              </span>
            )}
          </div>
          <p className="pt-1.5 text-sm leading-relaxed text-slate">{blurb}</p>

          {state.approach && expanded && (
            <p className="pt-2.5 text-2xs leading-relaxed text-slate">
              <span className="font-medium text-ink">Its approach: </span>
              {state.approach}
            </p>
          )}
        </div>

        <div className="shrink-0 text-center">
          {/* The verified figure wins once it exists. The live one is a fast
              estimate of what a text match can see; this one is the whole
              reading, and showing the estimate beside it would be two answers
              to one question. */}
          <ScoreDial
            value={verified?.score ?? score?.score ?? 0}
            baseline={baseline}
            size={dialSize}
            instant={applied > 0}
          />
          {verified && (
            <p className="pt-1 font-display text-2xs text-signal" data-numeric>
              verified · {verified.essentialMet}/{verified.essentialTotal} must-haves
            </p>
          )}
        </div>
      </header>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2.5 sm:px-5">
          {pending > 0 && (
            <button
              type="button"
              onClick={() => {
                onApplyAll();
                // Straight after, so the person sees what it did rather than a
                // number that may not have moved and no explanation of why.
                setSummaryOpen(true);
              }}
              className="inline-flex h-8 items-center rounded-pill bg-signal px-3.5 font-display text-xs font-medium text-paper transition-colors hover:bg-signal-hover"
            >
              Apply all {pending}
            </button>
          )}

          {applied > 0 ? (
            <button
              type="button"
              onClick={() => setSummaryOpen(true)}
              className="text-2xs text-signal underline decoration-signal/30 underline-offset-2 transition-colors hover:decoration-signal"
              data-numeric
            >
              {applied} applied — what changed?
            </button>
          ) : (
            <span className="text-2xs text-slate" data-numeric>
              {pending} waiting
            </span>
          )}

          {/* `flex-wrap`, and it matters: this row can carry five controls, and
              four of them are conditional. Without it the widest state pushes
              the close cross off the panel's right edge on a phone — the one
              control the person needs when they cannot see the rest. */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {onClaim && score && score.results.some((r) => r.status !== "covered") && (
              <button
                type="button"
                onClick={() => setGapsOpen(true)}
                className="inline-flex h-8 items-center rounded-pill bg-amber-soft px-3 font-display text-xs font-medium text-amber-ink transition-colors hover:brightness-95"
              >
                Add what is missing
              </button>
            )}
            {onRecheck && applied > 0 && (
              <button
                type="button"
                onClick={onRecheck}
                disabled={rechecking}
                className="inline-flex h-8 items-center rounded-pill px-3 font-display text-xs text-ink ring-1 ring-ink/10 transition-colors hover:bg-sunken disabled:opacity-50"
              >
                {rechecking ? "Re-reading…" : "Re-check score"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setDownloadOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-pill px-3 font-display text-xs text-ink ring-1 ring-ink/10 transition-colors hover:bg-sunken"
            >
              Download
              <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onApprove}
              disabled={busy || state.approved}
              className="inline-flex h-8 items-center rounded-pill bg-ink px-3.5 font-display text-xs font-medium text-paper transition-colors hover:bg-ink-soft disabled:opacity-45"
            >
              {state.approved ? "Saved" : busy ? "Saving…" : "Approve & save"}
            </button>

            <button
              type="button"
              onClick={onCollapse}
              aria-label="Close this version"
              // Square as it grows. An icon button that gains height and keeps
              // its width becomes a lozenge around a cross that is still 16px.
              className="grid size-8 place-items-center rounded-pill text-slate transition-colors hover:bg-sunken hover:text-ink [@media(pointer:coarse)]:w-11"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── The CV ────────────────────────────────────────────────────── */}
      {/* The 19rem is everything stacked above and below this on a laptop — bar,
          header, action row, footer. Subtracted from the window height it is
          the right answer there and an absurd one on a phone held sideways,
          where 100dvh is 390px and the result is an 86px reading window. The
          floor is what makes it a *maximum* rather than the only height it can
          be: below it, the panel simply grows and the page scrolls, which is
          what a short window wants anyway. */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          expanded ? "max-h-[max(22rem,calc(100dvh-19rem))]" : "max-h-80",
        )}
      >
        {state.document ? (
          <EditableCv
            document={state.document}
            changes={state.changes}
            editable={expanded}
            onApply={onApply}
            onUndo={onUndo}
            onDismiss={onDismiss}
            onEdit={onEdit}
          />
        ) : (
          <div className="grid place-items-center px-5 py-14 text-center">
            <p className="max-w-xs text-sm leading-relaxed text-slate">
              {side === "rebuilt"
                ? "Writing a new version from everything you have told us…"
                : "Preparing your CV…"}
            </p>
          </div>
        )}
      </div>

      {/* ── Before you send it ────────────────────────────────────────── */}
      {expanded && <Proofread document={state.document} />}

      {/* ── What it left out ──────────────────────────────────────────── */}
      {expanded && state.dropped.length > 0 && (
        <div className="border-t border-hairline bg-amber-soft/40 px-4 py-3 sm:px-5">
          <p className="font-display text-2xs font-medium uppercase tracking-[0.08em] text-amber-ink">
            {state.dropped.length} line{state.dropped.length === 1 ? "" : "s"} discarded
          </p>
          <ul className="space-y-1 pt-1.5">
            {state.dropped.slice(0, 3).map((item, index) => (
              <li key={index} className="text-2xs leading-relaxed text-slate">
                <span className="cv-literal text-slate/80">{item.text.slice(0, 90)}</span>
                {" — "}
                {item.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {onClaim && (
        <SkillGaps
          open={gapsOpen}
          onClose={() => setGapsOpen(false)}
          results={score?.results ?? []}
          onClaim={(claims) => {
            onClaim(claims.map((claim) => claim.evidence));
            setGapsOpen(false);
          }}
        />
      )}

      <DownloadDialog
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        document={state.document}
        // Only the tailored side has a file behind it. The rebuilt CV is a new
        // document by definition, so "keep my formatting" would be offering to
        // keep a formatting that never existed.
        canKeepFormat={canKeepFormat}
        sourceFormat={sourceFormat}
        onDownload={onDownload}
      />

      <ChangeSummary
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        applied={applied}
        score={score}
        before={baseline}
      />

      {!expanded && (
        <button
          type="button"
          onClick={onExpand}
          className="border-t border-hairline px-5 py-3 font-display text-xs font-medium text-signal transition-colors hover:bg-signal-soft/50"
        >
          Open and edit →
        </button>
      )}
    </motion.section>
  );
}
