"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { ChangeSummary } from "./ChangeSummary";
import { ScoreDial } from "./ScoreDial";
import { EditableCv } from "./EditableCv";
import { EASE, SPRING } from "@/components/motion/primitives";
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

const FORMATS: { value: TargetFormat; label: string }[] = [
  { value: "docx", label: "Word (.docx)" },
  { value: "pdf", label: "PDF" },
  { value: "tex", label: "LaTeX (.tex)" },
  { value: "md", label: "Markdown" },
  { value: "txt", label: "Plain text" },
];

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
  onDownload: (format: TargetFormat) => void;
  sourceFormat: string;
  busy?: boolean;
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
  busy = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
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

        <ScoreDial
          value={score?.score ?? 0}
          baseline={baseline}
          size={expanded ? 96 : 84}
          instant={applied > 0}
          className="shrink-0"
        />
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

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                className="inline-flex h-8 items-center gap-1.5 rounded-pill px-3 font-display text-xs text-ink ring-1 ring-ink/10 transition-colors hover:bg-sunken"
              >
                Download
                <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                </svg>
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={EASE}
                    className="absolute right-0 top-full z-20 mt-1.5 w-52 overflow-hidden rounded-lg bg-raised p-1 shadow-card ring-1 ring-ink/10"
                  >
                    {FORMATS.map((format) => {
                      const lossless = format.value === sourceFormat;
                      return (
                        <button
                          key={format.value}
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onDownload(format.value);
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm text-ink transition-colors hover:bg-sunken"
                        >
                          {format.label}
                          {/* Which one keeps their formatting, said before they
                              choose rather than discovered after. */}
                          <span className="font-display text-2xs text-slate">
                            {lossless ? "your layout" : "rebuilt"}
                          </span>
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
              className="grid size-8 place-items-center rounded-pill text-slate transition-colors hover:bg-sunken hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── The CV ────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          expanded ? "max-h-[calc(100dvh-19rem)]" : "max-h-80",
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
