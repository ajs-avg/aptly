"use client";

import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { AppBar, BarLink } from "@/components/app/AppBar";
import { RequireAccount } from "@/components/auth/RequireAccount";
import { SPRING } from "@/components/motion/primitives";
import { CvPanel } from "@/components/tailor/CvPanel";
import { DropBox } from "@/components/tailor/DropBox";
import { PitchNotes } from "@/components/tailor/PitchNotes";
import { RevealScreen } from "@/components/tailor/Reveal";
import { Button } from "@/components/ui/Button";
import {
  ApiError,
  exportCv,
  ingestFile,
  ingestPaste,
  rescore,
  saveRecord,
  streamTailor,
} from "@/lib/api";
import { cn, motionTokens } from "@/lib/utils";
import { useTailorRun, type Side } from "@/lib/useTailorRun";
import type { TargetFormat } from "@/lib/types";

/**
 * One job post, two finished CVs, and a score that moves while you work.
 *
 * The screen has three states and they are genuinely different screens rather
 * than three arrangements of one:
 *
 * 1. **Drop.** Two boxes and a button.
 * 2. **Reveal.** The score, as soon as it is knowable — which is roughly
 *    fifteen seconds before the first suggestion exists. Spending that wait on
 *    the most useful sentence the product has ("this job is asking for
 *    something else") beats spending it on a spinner.
 * 3. **Compare.** Both versions side by side, either one expandable into the
 *    working surface.
 */

const MIN_JOB_CHARS = 40;

function TailorScreen() {
  const { state, scores, actions } = useTailorRun();

  const [jobText, setJobText] = useState("");
  const [cvText, setCvText] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [ingesting, setIngesting] = useState(false);
  /**
   * Whether the person has moved past the score screen.
   *
   * Held here rather than derived from the run's phase, because the two answer
   * different questions. The run is not finished until the second CV is written
   * and both call sheets are prepared — a further minute — but the *first* one
   * is usable the moment its suggestions start arriving. Gating the screen on
   * the run being complete made everybody wait for work they had not asked to
   * see yet.
   */
  const [pastReveal, setPastReveal] = useState(false);
  const [saving, setSaving] = useState<Side | null>(null);
  const [rechecking, setRechecking] = useState<Side | null>(null);
  /**
   * The full re-read of an edited document, per side.
   *
   * Kept beside the live figure rather than replacing the scorecard, because
   * the two answer different questions: the card is what a text match can see
   * instantly, this is what the model says after reading the document again.
   */
  const [verified, setVerified] = useState<
    Partial<Record<Side, { score: number; essentialMet: number; essentialTotal: number }>>
  >({});
  const [inputError, setInputError] = useState<{ message: string; hint: string } | null>(null);

  const canStart = jobText.trim().length >= MIN_JOB_CHARS && Boolean(cvFile || cvText.trim());

  const start = useCallback(async () => {
    setIngesting(true);
    setInputError(null);
    try {
      const parsed = cvFile ? await ingestFile(cvFile) : await ingestPaste(cvText);
      actions.start(parsed.document, parsed.warnings);
      setPastReveal(false);

      // `both` rather than two requests: they share an analysis, and the two
      // slowest calls in the product would otherwise run twice for an answer
      // that is identical each time.
      for await (const event of streamTailor({
        document: parsed.document,
        jobText,
        mode: "both",
      })) {
        actions.event(event);
      }
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Something went wrong.";
      const hint =
        error instanceof ApiError ? error.hint : "Try again in a moment.";
      if (state.phase === "idle") setInputError({ message, hint });
      else actions.fail(message, hint);
    } finally {
      setIngesting(false);
    }
  }, [actions, cvFile, cvText, jobText, state.phase]);

  const download = useCallback(
    async (side: Side, format: TargetFormat) => {
      const document = state[side].document;
      if (!document) return;
      try {
        const result = await exportCv(document, side === "tailored" ? cvFile : null, format);
        const url = URL.createObjectURL(result.blob);
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = result.filename;
        anchor.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        actions.fail(
          error instanceof ApiError ? error.message : "The download failed.",
          error instanceof ApiError ? error.hint : "Try a different format.",
        );
      }
    },
    [actions, cvFile, state],
  );

  const recheck = useCallback(
    async (side: Side) => {
      const document = state[side].document;
      if (!document) return;
      setRechecking(side);
      try {
        const result = await rescore(document, jobText);
        setVerified((current) => ({
          ...current,
          [side]: {
            score: result.score,
            essentialMet: result.essential_met,
            essentialTotal: result.essential_total,
          },
        }));
      } catch (error) {
        actions.fail(
          error instanceof ApiError ? error.message : "Aptly could not re-check that.",
          error instanceof ApiError ? error.hint : "Try again in a moment.",
        );
      } finally {
        setRechecking(null);
      }
    },
    [actions, jobText, state],
  );

  const approve = useCallback(
    async (side: Side) => {
      const document = state[side].document;
      if (!document) return;
      setSaving(side);
      try {
        await saveRecord({
          jobText,
          job: state.job,
          filename: document.source_filename,
          sourceFormat: document.source_format,
          contentHash: document.content_hash,
          document,
          changeLog: state[side].changes
            .filter((change) => change.status === "applied")
            .map((change) => ({
              node_id: change.suggestion.node_id,
              before: change.suggestion.before,
              after: change.suggestion.after,
              reason: change.suggestion.reason,
            })),
        });
        actions.approve(side);
      } catch (error) {
        actions.fail(
          error instanceof ApiError ? error.message : "Aptly could not save that.",
          error instanceof ApiError ? error.hint : "Try again in a moment.",
        );
      } finally {
        setSaving(null);
      }
    },
    [actions, jobText, state],
  );

  if (state.phase === "idle") {
    return (
      <DropScreen
        jobText={jobText}
        cvText={cvText}
        cvFile={cvFile}
        onJobText={setJobText}
        onCvText={(value) => {
          setCvText(value);
          setCvFile(null);
        }}
        onCvFile={(file) => {
          setCvFile(file);
          setCvText("");
        }}
        onClearFile={() => setCvFile(null)}
        canStart={canStart}
        busy={ingesting}
        error={inputError}
        onStart={() => void start()}
      />
    );
  }

  // A failed run stops showing progress. Leaving the step list ticking under an
  // error banner reads as "still working", so people wait for something that is
  // never coming.
  const showReveal = state.phase !== "failed" && !pastReveal;

  return (
    <div className="min-h-dvh bg-mist">
      <AppBar
        brandHref="/"
        context={state.job?.role ? `${state.job.role}${state.job.company ? ` · ${state.job.company}` : ""}` : "Tailor"}
        status={
          scores.tailored ? (
            <span className="text-2xs text-slate" data-numeric>
              {scores.tailored.score}% · was {scores.baseline}%
            </span>
          ) : null
        }
      >
        <BarLink href="/library">Library</BarLink>
        <BarLink href="/sign-in?next=/library">Sign in</BarLink>
        <button
          type="button"
          onClick={() => {
            actions.reset();
            setPastReveal(false);
            setJobText("");
            setCvText("");
            setCvFile(null);
          }}
          className="inline-flex h-8 items-center rounded-pill px-3 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink"
        >
          Start over
        </button>
      </AppBar>

      {state.notices.length > 0 && (
        <ul className="mx-3 mt-2 space-y-1 rounded-lg bg-amber-soft/60 px-4 py-2">
          {state.notices.map((notice) => (
            <li key={notice} className="text-2xs leading-relaxed text-amber-ink">
              {notice}
            </li>
          ))}
        </ul>
      )}

      {state.error && (
        <div className="mx-3 mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-danger">{state.error.message}</p>
            <p className="pt-0.5 text-2xs leading-relaxed text-slate">{state.error.hint}</p>
          </div>
          {/* The hint says to press the button again, so there has to be one.
              It re-parses and re-runs from the text still in state — nobody
              should have to find and re-drop their file because Google was
              busy. Parsing is local and costs nothing. */}
          <button
            type="button"
            onClick={() => void start()}
            disabled={ingesting}
            className="inline-flex h-8 shrink-0 items-center rounded-pill bg-ink px-3.5 font-display text-xs font-medium text-paper transition-colors hover:bg-ink-soft disabled:opacity-45"
          >
            {ingesting ? "Trying…" : "Try again"}
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {showReveal ? (
          <motion.div key="reveal" exit={{ opacity: 0, y: -12 }} transition={SPRING}>
            <RevealScreen
              stage={state.phase === "ready" ? "ready" : state.analysis ? "working" : "reading"}
              score={scores.baseline || null}
              baseline={scores.baseline}
              fit={state.fit}
              analysis={state.analysis}
              detail={scores.tailored}
              // Available as soon as the score exists, not when the run ends.
              // Everything behind this screen fills in live.
              onSkip={state.analysis ? () => setPastReveal(true) : undefined}
              working={state.phase !== "ready"}
            />
          </motion.div>
        ) : state.phase === "failed" && !state.tailored.document ? (
          <motion.div
            key="failed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="gutter mx-auto grid min-h-[50dvh] max-w-content place-items-center py-16"
          >
            <p className="max-w-sm text-center text-sm leading-relaxed text-slate">
              Your job post and CV are still loaded. Press Try again above, or start
              over if you would rather change something.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="compare"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="gutter mx-auto max-w-ultra pb-14 pt-4"
          >
            {/* Expanded, the other version is off-screen — so it needs a way
                back that is not "collapse, look, expand again". Both scores sit
                on the switch, because the reason to look at the other one is
                almost always that it is ahead. */}
            {state.expanded && (
              <div className="flex justify-center pb-3">
                <div
                  role="tablist"
                  aria-label="Which version to work on"
                  className="inline-flex items-center gap-0.5 rounded-pill bg-raised p-0.5 shadow-float ring-1 ring-ink/5"
                >
                  {(["tailored", "rebuilt"] as const).map((side) => {
                    const active = state.expanded === side;
                    const score = scores[side]?.score;
                    return (
                      <button
                        key={side}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => actions.expand(side)}
                        className="relative inline-flex h-9 items-center gap-2 rounded-pill px-4"
                      >
                        {active && (
                          <motion.span
                            layoutId="panel-switch"
                            className="absolute inset-0 rounded-pill bg-signal-soft"
                            transition={SPRING}
                          />
                        )}
                        <span
                          className={cn(
                            "relative font-display text-xs font-medium transition-colors",
                            active ? "text-signal" : "text-slate hover:text-ink",
                          )}
                        >
                          {side === "tailored" ? "Your CV, tailored" : "Written from scratch"}
                        </span>
                        {score !== undefined && (
                          <span
                            className={cn(
                              "relative font-display text-2xs transition-colors",
                              active ? "text-signal" : "text-slate",
                            )}
                            data-numeric
                          >
                            {score}%
                          </span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => actions.expand(null)}
                    className="ml-1 inline-flex h-9 items-center rounded-pill px-3 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink"
                  >
                    Compare both
                  </button>
                </div>
              </div>
            )}

            <div
              className={
                state.expanded
                  ? "grid grid-cols-1 gap-3"
                  : "grid grid-cols-1 gap-3 lg:grid-cols-2"
              }
            >
              {(["tailored", "rebuilt"] as const).map((side) => {
                if (state.expanded && state.expanded !== side) return null;
                return (
                  <CvPanel
                    key={side}
                    side={side}
                    title={side === "tailored" ? "Your CV, tailored" : "Written from scratch"}
                    blurb={
                      side === "tailored"
                        ? "Your own file, with this job's changes applied. Formatting untouched."
                        : "A new document built from everything you have told us — its own sections, its own order."
                    }
                    state={state[side]}
                    score={scores[side]}
                    baseline={scores.baseline}
                    expanded={state.expanded === side}
                    onExpand={() => actions.expand(side)}
                    onCollapse={() => actions.expand(null)}
                    onApply={(nodeId) => {
                      const change = state[side].changes.find(
                        (item) => item.suggestion.node_id === nodeId,
                      );
                      if (change) actions.apply(side, change.suggestion);
                    }}
                    onUndo={(nodeId, previousText) => actions.undo(side, nodeId, previousText)}
                    onDismiss={(nodeId) => actions.dismiss(side, nodeId)}
                    onApplyAll={() => actions.applyAll(side)}
                    onEdit={(nodeId, text) => actions.edit(side, nodeId, text)}
                    onApprove={() => void approve(side)}
                    onDownload={(format) => void download(side, format)}
                    sourceFormat={state[side].document?.source_format ?? "docx"}
                    busy={saving === side}
                    onRecheck={() => void recheck(side)}
                    rechecking={rechecking === side}
                    verified={verified[side] ?? null}
                    onClaim={(lines) => actions.claim(side, lines)}
                  />
                );
              })}
            </div>

            {state.expanded && state[state.expanded].pitch && (
              <div className="pt-3">
                <PitchNotes card={state[state.expanded].pitch!} />
              </div>
            )}

            {!state.expanded && (
              <p className="pt-5 text-center text-2xs leading-relaxed text-slate">
                Open either version to edit it line by line. The score moves as you
                work — requirements answered by naming something update live; the
                ones decided by judgement are re-checked when you approve.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Drop
   ═══════════════════════════════════════════════════════════════════════════ */

function DropScreen({
  jobText,
  cvText,
  cvFile,
  onJobText,
  onCvText,
  onCvFile,
  onClearFile,
  canStart,
  busy,
  error,
  onStart,
}: {
  jobText: string;
  cvText: string;
  cvFile: File | null;
  onJobText: (value: string) => void;
  onCvText: (value: string) => void;
  onCvFile: (file: File) => void;
  onClearFile: () => void;
  canStart: boolean;
  busy: boolean;
  error: { message: string; hint: string } | null;
  onStart: () => void;
}) {
  return (
    <div className="min-h-dvh bg-mist">
      <AppBar brandHref="/" context="Tailor">
        <BarLink href="/library">Library</BarLink>
      </AppBar>

      <div className="gutter mx-auto max-w-content py-12 sm:py-16">
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionTokens.slow, ease: motionTokens.easeOut }}
          className="mx-auto max-w-2xl text-center"
        >
          <h1
            className="text-balance font-display font-semibold tracking-[-0.035em] text-ink"
            style={{ fontSize: "clamp(2rem, 4.6vw, 3rem)", lineHeight: 1.06 }}
          >
            Tailor every application.
          </h1>
          <p className="mx-auto max-w-lg pt-4 text-lg leading-relaxed text-slate">
            Drop the job post and your CV. See how well it matches, then two ways to
            answer it.
          </p>
        </motion.header>

        {/* Asymmetric on purpose: the CV is the object being improved. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionTokens.slow, ease: motionTokens.easeOut, delay: 0.08 }}
          className="grid grid-cols-1 gap-3 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]"
        >
          <DropBox
            label="Job post"
            hint="paste it"
            placeholder="Paste the job description here — the whole thing is fine."
            value={jobText}
            onTextChange={onJobText}
          />
          <DropBox
            label="Your CV"
            hint=".docx · .pdf · .tex · .txt"
            placeholder="Paste your CV, or drop a file anywhere in this box."
            accept=".docx,.pdf,.tex,.txt,.md"
            value={cvText}
            onTextChange={onCvText}
            onFile={onCvFile}
            file={cvFile}
            onClearFile={onClearFile}
            emphasis
            footer={
              <p className="text-2xs leading-relaxed text-slate">
                Word and LaTeX files are edited in place, so your formatting is kept
                exactly.
              </p>
            }
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: motionTokens.slow, delay: 0.16 }}
          className="flex flex-col items-center gap-3 pt-8"
        >
          <Button size="lg" variant="primary" disabled={!canStart || busy} onClick={onStart}>
            {busy ? "Reading your CV…" : "Show me the match"}
          </Button>
          <p className="text-sm text-slate">Takes about a minute.</p>
        </motion.div>

        {error && (
          <div className="mx-auto max-w-xl pt-5">
            <div className="rounded-lg bg-danger-soft px-4 py-3">
              <p className="text-sm font-medium text-danger">{error.message}</p>
              <p className="pt-0.5 text-2xs text-slate">{error.hint}</p>
            </div>
          </div>
        )}

        <p className="mx-auto max-w-lg pt-10 text-center text-sm leading-relaxed text-slate">
          Aptly only rewrites what you have already written. It never adds a skill, a
          number or a job you do not have — and anything you should double-check is
          marked.
        </p>
      </div>
    </div>
  );
}

/**
 * Everything here needs an account.
 *
 * The gate stands aside where Supabase is not configured, so a local checkout
 * with no auth still opens.
 */
export default function Page() {
  return (
    <RequireAccount>
      <TailorScreen />
    </RequireAccount>
  );
}
