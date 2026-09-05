"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { AccountButton } from "@/components/marketing/AccountButton";
import { AppBar, BarLink } from "@/components/app/AppBar";
import { RequireAccount } from "@/components/auth/RequireAccount";
import { SPRING } from "@/components/motion/primitives";
import { CvPanel } from "@/components/tailor/CvPanel";
import { AgentDock } from "@/components/tailor/AgentDock";
import { CoverLetterCard } from "@/components/tailor/CoverLetterCard";
import { CvSource } from "@/components/tailor/CvSource";
import { DropBox } from "@/components/tailor/DropBox";
import { PitchNotes } from "@/components/tailor/PitchNotes";
import { RevealScreen } from "@/components/tailor/Reveal";
import { Button } from "@/components/ui/Button";
import {
  ApiError,
  exportCv,
  ingestFile,
  ingestPaste,
  profileAsCv,
  rescore,
  saveRecord,
  streamTailor,
} from "@/lib/api";
import { addLine, setNodeText, toPlainText } from "@/lib/document";
import { clearSession, loadSession, saveSession } from "@/lib/persist";
import { evaluate } from "@/lib/score";
import { cn, motionTokens } from "@/lib/utils";
import { useTailorRun, type RunState, type Side } from "@/lib/useTailorRun";
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

/**
 * The note the Library leaves when somebody chooses "Edit in tailor".
 *
 * Read once and removed: it is an instruction for one arrival, not a setting.
 * sessionStorage, because the Library and this screen are the same tab talking
 * to itself across a navigation.
 */
function readReopen(): { jobText?: string; cvText?: string } | null {
  try {
    const raw = sessionStorage.getItem("aptly-reopen");
    if (!raw) return null;
    sessionStorage.removeItem("aptly-reopen");
    return JSON.parse(raw) as { jobText?: string; cvText?: string };
  } catch {
    return null;
  }
}

function TailorScreen() {
  const { state, scores, actions } = useTailorRun();

  const [jobText, setJobText] = useState("");
  const [cvText, setCvText] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  /**
   * Tailor from the saved profile instead of a file.
   *
   * The profile holds a whole career where a CV holds what fitted on two
   * pages, so somebody who keeps it current has a better starting document
   * than the resume in their downloads folder — and does not have to go and
   * find that resume. `/api/profile/as-cv` renders it on request, so it is
   * never a stale second copy.
   */
  const [useProfile, setUseProfile] = useState(false);
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

  /**
   * The score the screen shows for a side — one number everywhere.
   *
   * The model's full re-read wins once it exists; the live text-match stands
   * in until then. The dial already chose this way, but the app bar and the
   * version tabs kept quoting the live figure — so a re-check moved the dial
   * to 53% while the tab beside it said 34%, and the person reasonably read
   * that as the product disagreeing with itself.
   */
  const shownScore = useCallback(
    (side: Side): number | undefined => verified[side]?.score ?? scores[side]?.score,
    [verified, scores],
  );

  /**
   * What the person has told either agent this session.
   *
   * Held here rather than in each panel, because that is what makes it shared:
   * a GitHub link given to the left-hand agent is a fact about them, not about
   * a document, and the right-hand one should not have to be told again. It
   * never leaves the page — no database, gone when the tab is.
   */
  const [agentFacts, setAgentFacts] = useState<Record<string, string>>({});
  /**
   * Lines the agent just touched, for the CV to scroll to and glow. The stamp
   * distinguishes "the same lines, pointed at again" from nothing happening.
   */
  const [agentFlash, setAgentFlash] = useState<{
    side: Side;
    ids: string[];
    stamp: number;
  } | null>(null);

  /*
   * ── Surviving a reload ──────────────────────────────────────────────────
   *
   * Everything on this screen lived in React state, so a refresh — deliberate,
   * accidental, or a phone evicting the tab — threw away the job post, the CV,
   * the analysis, and every change the person had applied by hand. Then it
   * asked them to pay for the whole minute again.
   *
   * `restored` gates the first paint rather than merely triggering a later one.
   * Reading IndexedDB is a promise, so without it the drop screen renders for a
   * frame or two before the saved run replaces it — and somebody returning to
   * their work sees an empty upload box first, which is the exact thing this
   * exists to stop them seeing.
   */
  const [restored, setRestored] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    void loadSession<RunState>().then((snapshot) => {
      if (!live) return;
      // Arriving from the Library with a saved CV to reopen. The explicit
      // click outranks any leftover session: the boxes are seeded with the
      // record's document and advert, ready to run — against the same post or
      // a new one.
      const reopen = readReopen();
      if (reopen?.cvText) {
        setJobText(reopen.jobText ?? "");
        setCvText(reopen.cvText);
        void clearSession();
        setRestored(true);
        return;
      }
      if (snapshot) {
        setJobText(snapshot.jobText);
        setCvText(snapshot.cvText);
        setCvFile(snapshot.cvFile);
        setPastReveal(snapshot.pastReveal);
        setVerified(snapshot.verified as typeof verified);
        actions.restore(snapshot.run);
      }
      setRestored(true);
    });
    return () => {
      live = false;
    };
    // Once, on mount. `actions` is stable and the saved snapshot is a starting
    // point, not something to keep re-reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Not before the restore has landed, or the empty initial state is written
    // over the snapshot it is about to be replaced by.
    if (!restored) return;

    // Debounced, because this also fires on every keystroke in the job post and
    // on every frame of a score animation that touches the document.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // An untouched screen is not a session. Writing one means a person who
      // opened the page and left finds it waiting for them next week.
      if (state.phase === "idle" && !jobText && !cvText && !cvFile) {
        void clearSession();
        return;
      }
      void saveSession<RunState>({
        jobText,
        cvText,
        cvFile,
        // Without the undo history. It is forty whole documents, and writing it
        // on every keystroke would make the saved session forty times larger
        // for something nobody expects to survive a reload — undo is about the
        // last few minutes, and a reload is not one of them.
        run: {
          ...state,
          tailored: { ...state.tailored, past: [], future: [] },
          rebuilt: { ...state.rebuilt, past: [], future: [] },
        },
        pastReveal,
        verified,
      });
    }, 400);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [restored, state, jobText, cvText, cvFile, pastReveal, verified]);

  /*
   * Cmd-Z and Cmd-Shift-Z, on whichever CV is open.
   *
   * Only when one is expanded: with both panels side by side there is no
   * answer to "undo what", and guessing would undo the one somebody is not
   * looking at. Ignored while a field has focus, because there the browser's
   * own undo is the right one and taking it over loses a half-typed sentence.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      const side = state.expanded;
      if (!side) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      event.preventDefault();
      if (event.shiftKey) actions.stepForward(side);
      else actions.stepBack(side);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions, state.expanded]);

  const canStart =
    jobText.trim().length >= MIN_JOB_CHARS &&
    (useProfile || Boolean(cvFile || cvText.trim()));

  const start = useCallback(async () => {
    setIngesting(true);
    setInputError(null);
    try {
      // Three ways in, one document out. The profile path skips ingest
      // entirely — there is no file to parse, only a profile to render.
      const parsed = useProfile
        ? { ...(await profileAsCv()), warnings: [] }
        : cvFile
          ? await ingestFile(cvFile)
          : await ingestPaste(cvText);
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
  }, [actions, cvFile, cvText, jobText, state.phase, useProfile]);

  /**
   * What this CV would score if a set of proposed edits were applied.
   *
   * Computed here rather than asked of the server: the scorecard is already in
   * the browser and evaluating it is a few hundred regex tests over a page of
   * text. A round trip for a number that has to appear the instant a review
   * opens would be the slowest part of the whole interaction.
   */
  const scoreWith = useCallback(
    (side: Side, edits: { node_id: string; kind: string; before: string; after: string }[]) => {
      const card = state.scorecard;
      const document = state[side].document;
      if (!card || !document) return { before: 0, after: 0 };

      const before = toPlainText(document);
      let projected = document;
      for (const edit of edits) {
        projected =
          edit.kind === "add"
            ? addLine(projected, edit.node_id, edit.after)
            : setNodeText(projected, edit.node_id, edit.after);
      }
      return {
        before: evaluate(card, before).score,
        after: evaluate(card, toPlainText(projected)).score,
      };
    },
    [state],
  );

  const download = useCallback(
    async (side: Side, format: TargetFormat, template: string | null) => {
      const document = state[side].document;
      if (!document) return;
      try {
        // A template replaces their formatting, so the original file is not
        // sent with it — an in-place edit and a chosen layout are mutually
        // exclusive by definition.
        const original = side === "tailored" && !template ? cvFile : null;
        const result = await exportCv(document, original, format, template ?? undefined);
        const url = URL.createObjectURL(result.blob);
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = result.filename;
        // In the document, and revoked on a later tick.
        //
        // A detached anchor's synthetic click is ignored outright by Firefox,
        // and revoking the URL in the same turn as the click pulls the blob out
        // from under a download that has not started reading it yet — which
        // lands as a truncated or empty file, intermittently, on whichever
        // machine happens to be slower that day.
        anchor.style.display = "none";
        window.document.body.append(anchor);
        anchor.click();
        setTimeout(() => {
          anchor.remove();
          URL.revokeObjectURL(url);
        }, 0);
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
          // The score as it stands at the moment of saving, verified figure
          // first — the same number the screen is showing. The Library quotes
          // it back when a recruiter calls weeks later.
          score: shownScore(side) ?? null,
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
    [actions, jobText, state, shownScore],
  );

  // The saved session has not been read yet. A blank ground rather than a
  // spinner: this resolves in a frame or two, and a spinner that appears and
  // vanishes that fast reads as a flicker, not as progress.
  if (!restored) return <div className="min-h-dvh bg-mist" />;

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
        useProfile={useProfile}
        onUseProfile={setUseProfile}
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
        // The same measure as the working surface below it, so the wordmark and
        // the first CV panel start on one vertical line. They did not: the bar
        // was capped at 96rem over content capped at 112rem, which on a wide
        // display put them 128px out of step.
        width="ultra"
        context={state.job?.role ? `${state.job.role}${state.job.company ? ` · ${state.job.company}` : ""}` : "Tailor"}
        status={
          scores.tailored ? (
            <span className="shrink-0 whitespace-nowrap text-2xs text-slate" data-numeric>
              {shownScore("tailored")}% · was {scores.baseline}%
            </span>
          ) : null
        }
        // The account, not a "Sign in" link — this screen is behind the gate.
        // Through `account` rather than as a child, so its menu is not opened
        // inside the scrolling strip that would clip it.
        account={<AccountButton />}
      >
        <BarLink href="/library">Library</BarLink>
        <button
          type="button"
          onClick={() => {
            actions.reset();
            setPastReveal(false);
            setJobText("");
            setCvText("");
            setCvFile(null);
            setUseProfile(false);
            setVerified({});
            // Erased now, not left to expire. Start over is the one control
            // that means "this is finished with" — on a shared machine it is
            // also how somebody removes their CV from it.
            void clearSession();
          }}
          className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-pill px-3 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink"
        >
          Start over
        </button>
      </AppBar>

      {/* Both banners sit on the bar's own measure rather than on the window's.
          `mx-3` spans the full width of whatever the display is, so on anything
          wide they ran out past both ends of the bar above them — an error
          message wider than the product it is reporting on. */}
      {(state.notices.length > 0 || state.error) && (
        <div className="gutter-bar mx-auto max-w-ultra space-y-2 pt-2">
          {state.notices.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-soft/60 px-4 py-2">
              {state.notices.map((notice) => (
                <li key={notice} className="text-2xs leading-relaxed text-amber-ink">
                  {notice}
                </li>
              ))}
            </ul>
          )}

          {state.error && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-danger-soft px-4 py-3">
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
                className="inline-flex h-9 shrink-0 items-center rounded-pill bg-ink px-3.5 font-display text-xs font-medium text-paper transition-colors hover:bg-ink-soft disabled:opacity-45"
              >
                {ingesting ? "Trying…" : "Try again"}
              </button>
            </div>
          )}
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
              // The switch carries two full sentences and three numbers, which
              // is around 420px of content — more than a phone has. It scrolls
              // rather than wraps, because a wrapped pill is two lozenges, and
              // the labels themselves shorten below `sm` so that on most phones
              // the scroll never engages.
              <div className="no-scrollbar scroll-x -mx-1 flex justify-center px-1 pb-3">
                <div
                  role="tablist"
                  aria-label="Which version to work on"
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-raised p-0.5 shadow-float ring-1 ring-ink/5"
                >
                  {(["tailored", "rebuilt"] as const).map((side) => {
                    const active = state.expanded === side;
                    const score = shownScore(side);
                    return (
                      <button
                        key={side}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => actions.expand(side)}
                        className="relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill px-3 sm:px-4"
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
                          {/* The short form is the same distinction in fewer
                              words, not a different one: yours edited, versus
                              one written from nothing. */}
                          <span className="sm:hidden">
                            {side === "tailored" ? "Yours" : "Rebuilt"}
                          </span>
                          <span className="hidden sm:inline">
                            {side === "tailored" ? "Your CV, tailored" : "Written from scratch"}
                          </span>
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
                    className="ml-1 inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-pill px-3 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink"
                  >
                    <span className="sm:hidden">Both</span>
                    <span className="hidden sm:inline">Compare both</span>
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
                    onDownload={(format, template) => void download(side, format, template)}
                    sourceFormat={state[side].document?.source_format ?? "docx"}
                    // Only the tailored side has a file behind it: the rebuilt
                    // CV is a new document, so there is no formatting of theirs
                    // to keep.
                    canKeepFormat={side === "tailored" && Boolean(cvFile)}
                    busy={saving === side}
                    onRecheck={() => void recheck(side)}
                    rechecking={rechecking === side}
                    verified={verified[side] ?? null}
                    onClaim={(lines) => actions.claim(side, lines)}
                    onStepBack={() => actions.stepBack(side)}
                    onStepForward={() => actions.stepForward(side)}
                    canStepBack={state[side].past.length > 0}
                    canStepForward={state[side].future.length > 0}
                    highlight={agentFlash?.side === side ? agentFlash : null}
                  />
                );
              })}
            </div>

            <AgentDock
              documents={{
                tailored: state.tailored.document,
                rebuilt: state.rebuilt.document,
              }}
              expanded={state.expanded}
              jobText={jobText}
              facts={agentFacts}
              onFacts={setAgentFacts}
              onEdits={(side, edits) => actions.agentEdits(side, edits)}
              scoreFor={(side, edits) => scoreWith(side, edits)}
              onHighlight={(side, ids) =>
                setAgentFlash({ side, ids, stamp: Date.now() })
              }
              onReveal={(side) => actions.expand(side)}
            />

            {state.expanded && state[state.expanded].pitch && (
              <div className="pt-3">
                <PitchNotes card={state[state.expanded].pitch!} />
              </div>
            )}

            {/* Under the comparison, where the space was: the letter that goes
                with whichever CV they send. Drawn from the tailored one — the
                document with their own file behind it. */}
            {!state.expanded && (
              <CoverLetterCard document={state.tailored.document} jobText={jobText} />
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
  useProfile,
  onUseProfile,
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
  useProfile: boolean;
  onUseProfile: (value: boolean) => void;
  canStart: boolean;
  busy: boolean;
  error: { message: string; hint: string } | null;
  onStart: () => void;
}) {
  return (
    <div className="min-h-dvh bg-mist">
      {/* `content`, because that is what this screen is: two boxes on the
          reading measure, not the app's full working surface. The bar follows
          the page rather than the page following the bar. */}
      {/* The account button belongs here as much as on the compare screen.
          Without it this page is a dead end for anyone wanting their profile —
          which is exactly what somebody who has just imported a CV is looking
          for, and the screen that offers to use that profile was the one page
          with no way to reach it. */}
      <AppBar brandHref="/" context="Tailor" width="content" account={<AccountButton />}>
        <BarLink href="/library">Library</BarLink>
      </AppBar>

      <div className="gutter mx-auto max-w-content py-10 sm:py-16">
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
          <CvSource
            cvText={cvText}
            cvFile={cvFile}
            useProfile={useProfile}
            onUseProfile={onUseProfile}
            onCvText={onCvText}
            onCvFile={onCvFile}
            onClearFile={onClearFile}
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
