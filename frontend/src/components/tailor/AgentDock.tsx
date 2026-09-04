"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE, SPRING } from "@/components/motion/primitives";
import { ApiError, askAgent } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Side } from "@/lib/useTailorRun";
import type {
  AgentEdit,
  AgentResponse,
  AgentTurn,
  CVDocument,
} from "@/lib/types";

/**
 * The agents, in one dock that floats over the whole screen.
 *
 * There are still two of them — one per document, and neither can read the
 * other's CV. What changed is where they live. Folded into a strip at the foot
 * of each panel, the agent was the product's most capable feature presented as
 * its least visible one: people scrolled past it, and when it did act, the
 * change landed somewhere off-screen with nothing pointing at it.
 *
 * ── One dock, two conversations ─────────────────────────────────────────────
 *
 * The dock follows whichever CV is open, and carries a separate conversation
 * for each side. Switching CVs switches the conversation — the same way
 * switching documents switches whose margins you are writing in.
 *
 * ── What one is told, the other offers to use ───────────────────────────────
 *
 * A fact given to either agent — a GitHub link, a number, a date — lands in the
 * shared pool the page owns. When you switch to the other CV, its agent checks
 * that pool against what it has already been told, and *offers* the difference:
 * "you mentioned this — want it on this one too?" It asks rather than acts,
 * because the two documents are two different arguments for the same person,
 * and what belongs on one is a decision, not a default.
 *
 * ── Every change is pointed at ──────────────────────────────────────────────
 *
 * When edits land, the CV scrolls to the first one and every touched line
 * glows for a moment. The change list and undo still work exactly as before —
 * this adds visibility, not a new mechanism.
 */

const SIDE_LABEL: Record<Side, string> = {
  tailored: "Yours",
  rebuilt: "Rebuilt",
};

export function AgentDock({
  documents,
  expanded,
  jobText,
  facts,
  onFacts,
  onEdits,
  scoreFor,
  onHighlight,
}: {
  documents: Record<Side, CVDocument | null>;
  /** Which panel the page has open, so the dock can follow. */
  expanded: Side | null;
  jobText: string;
  /** Shared between both agents. Held by the page, never stored. */
  facts: Record<string, string>;
  onFacts: (facts: Record<string, string>) => void;
  onEdits: (side: Side, edits: AgentEdit[]) => void;
  scoreFor: (side: Side, edits: AgentEdit[]) => { before: number; after: number };
  /** Point the CV at what just changed: scroll there, glow the lines. */
  onHighlight: (side: Side, nodeIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<Side>("tailored");
  const [histories, setHistories] = useState<Record<Side, AgentTurn[]>>({
    tailored: [],
    rebuilt: [],
  });
  const [drafts, setDrafts] = useState<Record<Side, string>>({
    tailored: "",
    rebuilt: "",
  });
  const [busy, setBusy] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A large change, waiting to be read before it happens. */
  const [review, setReview] = useState<{ side: Side; response: AgentResponse } | null>(null);
  /** The last turn's edits, so "show me" can point at them again. */
  const [lastEdits, setLastEdits] = useState<{ side: Side; ids: string[] } | null>(null);
  /**
   * Which fact keys each side's agent has been sent. Every turn carries the
   * whole pool, so after a turn on one side that side has seen everything —
   * and whatever the *other* side has not seen yet is exactly what it should
   * offer when you switch to it.
   */
  const [seen, setSeen] = useState<Record<Side, string[]>>({
    tailored: [],
    rebuilt: [],
  });
  const endRef = useRef<HTMLDivElement>(null);

  const history = histories[side];

  // The dock follows the page: open a CV and its agent is the one talking.
  // Adjusted during render rather than in an effect — the guarded-setState
  // pattern from react.dev/learn/you-might-not-need-an-effect.
  const [prevExpanded, setPrevExpanded] = useState(expanded);
  if (expanded !== prevExpanded) {
    setPrevExpanded(expanded);
    if (expanded) setSide(expanded);
  }

  /*
   * What was said to the other agent, offered to this one — never applied
   * unasked.
   *
   * Derived rather than stored, because it is a difference between two pieces
   * of state (the shared pool, and what this side has been sent), and a copy
   * of a difference can outlive it. Answering the offer changes `seen`, and
   * the offer is simply not there on the next render.
   *
   * Gated on the other side having spoken: facts only exist because somebody
   * said them to an agent, and the side they were said to has already seen
   * them — so an unseen fact here is precisely a fact from over there.
   */
  const offer =
    documents[side] && !busy && histories[side === "tailored" ? "rebuilt" : "tailored"].length > 0
      ? Object.entries(facts).filter(([key]) => !seen[side].includes(key))
      : [];

  // An offer nobody sees is not an offer: surface the dock when one appears.
  const offerKey = offer.map(([key]) => key).join(",");
  const [prevOfferKey, setPrevOfferKey] = useState("");
  if (offerKey !== prevOfferKey) {
    setPrevOfferKey(offerKey);
    if (offerKey) setOpen(true);
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, busy, offerKey, open]);

  const markSeen = (which: Side, keys: string[]) =>
    setSeen((current) => ({
      ...current,
      [which]: [...new Set([...current[which], ...keys])],
    }));

  const pushTurn = (which: Side, turn: AgentTurn) =>
    setHistories((current) => ({ ...current, [which]: [...current[which], turn] }));

  const send = async (text: string) => {
    const instruction = text.trim();
    const doc = documents[side];
    if (!instruction || !doc || busy) return;

    const target = side;
    setDrafts((current) => ({ ...current, [target]: "" }));
    setError(null);
    setBusy(target);
    pushTurn(target, { role: "user", content: instruction });

    try {
      const response = await askAgent({
        document: doc,
        jobText,
        instruction,
        history: histories[target],
        facts,
        side: target,
      });

      pushTurn(target, { role: "agent", content: response.reply });
      onFacts(response.facts);
      // This side has now been sent the whole pool, including anything this
      // very turn added.
      markSeen(target, Object.keys(response.facts));

      if (response.scale === "large" && response.edits.length) {
        setReview({ side: target, response });
      } else if (response.edits.length) {
        land(target, response.edits);
      }

      if (response.refused.length) {
        pushTurn(target, {
          role: "agent",
          content: response.refused
            .map((item) => `I did not change “${item.what}”. ${item.why}`)
            .join("\n\n"),
        });
      }
      if (response.questions.length) {
        pushTurn(target, {
          role: "agent",
          content: response.questions.map((q) => `• ${q}`).join("\n"),
        });
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? [caught.message, caught.hint].filter(Boolean).join(" ")
          : "Aptly could not reach the server.",
      );
      // The instruction stays in the box: a failed send must not eat what they
      // typed.
      setDrafts((current) => ({ ...current, [target]: instruction }));
      setHistories((current) => ({ ...current, [target]: current[target].slice(0, -1) }));
    } finally {
      setBusy(null);
    }
  };

  /** Edits into the document, and the person's eye onto them. */
  const land = (which: Side, edits: AgentEdit[]) => {
    onEdits(which, edits);
    const ids = edits.map((edit) => edit.node_id);
    setLastEdits({ side: which, ids });
    onHighlight(which, ids);
  };

  // Nothing to talk to until a run has produced at least one document.
  if (!documents.tailored && !documents.rebuilt) return null;

  const unseenCount = offer.length;

  return (
    <>
      {/* ── The bubble ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="bubble"
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Talk to this CV's agent"
            initial={{ opacity: 0, scale: 0.6, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 12 }}
            transition={SPRING}
            className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-40 grid size-14 place-items-center rounded-full bg-signal text-paper shadow-hero transition-colors hover:bg-signal-hover"
          >
            {/* A ring that breathes while an offer is waiting: something to
                look at, from a button whose job is to be looked at. */}
            {unseenCount > 0 && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full bg-signal"
                initial={{ opacity: 0.5, scale: 1 }}
                animate={{ opacity: 0, scale: 1.55 }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <svg viewBox="0 0 24 24" className="relative size-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 6 3-3h9a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3z" />
            </svg>
            {unseenCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-amber text-2xs font-semibold text-ink ring-2 ring-paper">
                {unseenCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── The conversation ────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            role="dialog"
            aria-label="CV agent"
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.97 }}
            transition={SPRING}
            className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-40 flex max-h-[min(34rem,calc(100dvh-5rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl bg-raised shadow-hero ring-1 ring-ink/10"
          >
            <header className="flex items-center gap-2 border-b border-hairline px-3.5 py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {(["tailored", "rebuilt"] as const).map((which) => (
                  <button
                    key={which}
                    type="button"
                    onClick={() => setSide(which)}
                    disabled={!documents[which]}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-pill px-3 font-display text-xs font-medium transition-colors disabled:opacity-35",
                      side === which
                        ? which === "rebuilt"
                          ? "bg-amber-soft text-amber-ink"
                          : "bg-signal-soft text-signal"
                        : "text-slate hover:bg-sunken hover:text-ink",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "inline-block size-1.5 rounded-full",
                        which === "rebuilt" ? "bg-amber" : "bg-signal",
                      )}
                    />
                    {SIDE_LABEL[which]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close the agent"
                className="grid size-8 place-items-center rounded-pill text-slate transition-colors hover:bg-sunken hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3.5 py-3">
              {history.length === 0 && offer.length === 0 && (
                <div>
                  <p className="pb-2 text-2xs leading-relaxed text-slate">
                    This is the {side === "rebuilt" ? "rebuilt" : "tailored"} CV’s
                    agent. It can rewrite, add, remove and reorder — anything you
                    can describe — and it can only <em>write</em> what you have
                    already told it. Every change is shown on the CV and undoable.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Make the summary shorter",
                      "Lead with the strongest result",
                      "Drop the weakest bullet",
                      "This sounds like every other CV",
                    ].map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => void send(example)}
                        className="rounded-pill bg-sunken px-2.5 py-1 font-display text-2xs text-slate transition-colors hover:bg-signal-soft hover:text-signal"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <AnimatePresence initial={false} mode="popLayout">
                {history.map((turn, index) => (
                  <motion.div
                    key={`${side}-${index}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={EASE}
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed",
                      turn.role === "user"
                        ? "ml-auto bg-signal-soft text-ink"
                        : "bg-sunken text-ink",
                    )}
                  >
                    {turn.content}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* What just changed, pointed at — and pointable-at again. */}
              {lastEdits && lastEdits.side === side && !busy && (
                <button
                  type="button"
                  onClick={() => onHighlight(side, lastEdits.ids)}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-signal-soft px-3 py-1.5 font-display text-2xs font-medium text-signal transition-colors hover:bg-signal/15"
                >
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0-5-5m5 5 5-5" />
                  </svg>
                  {lastEdits.ids.length} change{lastEdits.ids.length === 1 ? "" : "s"} marked on
                  the CV — show me
                </button>
              )}

              {/* The other conversation's facts, offered to this one. */}
              <AnimatePresence>
                {offer.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={SPRING}
                    className="rounded-xl bg-amber-soft/60 px-3 py-2.5 ring-1 ring-amber/25"
                  >
                    <p className="text-sm leading-relaxed text-ink">
                      While we worked on the other CV, you told me:
                    </p>
                    <ul className="space-y-0.5 pt-1.5">
                      {offer.map(([key, value]) => (
                        <li key={key} className="text-2xs leading-relaxed text-ink/85">
                          <span className="font-medium">{key}</span> — {value}
                        </li>
                      ))}
                    </ul>
                    <p className="pt-1.5 text-2xs text-slate">
                      Want it on this CV too? I will place it where it fits.
                    </p>
                    <div className="flex items-center gap-1.5 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const what = offer
                            .map(([key, value]) => `${key}: ${value}`)
                            .join("; ");
                          void send(`Add this to the CV wherever it fits best: ${what}`);
                        }}
                        className="inline-flex h-7 items-center rounded-pill bg-signal px-3 font-display text-2xs font-medium text-paper transition-colors hover:bg-signal-hover"
                      >
                        Add it here
                      </button>
                      <button
                        type="button"
                        onClick={() => markSeen(side, offer.map(([key]) => key))}
                        className="inline-flex h-7 items-center rounded-pill px-2.5 font-display text-2xs text-slate transition-colors hover:bg-sunken hover:text-ink"
                      >
                        Not now
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {busy === side && (
                <div className="flex items-center gap-1.5 pl-1 text-2xs text-slate">
                  <motion.span
                    aria-hidden
                    className="inline-block size-1.5 rounded-full bg-slate"
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  Reading your CV…
                </div>
              )}
              <div ref={endRef} />
            </div>

            {error && (
              <p role="alert" className="mx-3.5 mb-2 rounded-lg bg-danger-soft px-3 py-2 text-2xs text-danger">
                {error}
              </p>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(drafts[side]);
              }}
              className="flex items-end gap-2 border-t border-hairline px-3.5 py-3"
            >
              <textarea
                value={drafts[side]}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [side]: event.target.value }))
                }
                onKeyDown={(event) => {
                  // Enter sends; Shift+Enter is a new line. A CV instruction is
                  // one sentence far more often than it is a paragraph.
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(drafts[side]);
                  }
                }}
                rows={1}
                placeholder="Shorten the summary, add my GitHub, drop the last bullet…"
                className="min-h-[2.75rem] flex-1 resize-y rounded-xl bg-sunken px-3.5 py-2.5 text-[1rem] leading-relaxed text-ink ring-1 ring-hairline placeholder:text-slate/45 focus:outline-none focus:ring-2 focus:ring-signal sm:text-sm"
              />
              <button
                type="submit"
                disabled={Boolean(busy) || !drafts[side].trim()}
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-signal text-paper transition-colors hover:bg-signal-hover disabled:opacity-40"
                aria-label="Send"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0-6-6m6 6-6 6" />
                </svg>
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <ReviewDialog
        response={review?.response ?? null}
        score={review ? scoreFor(review.side, review.response.edits) : null}
        onApply={() => {
          if (review) land(review.side, review.response.edits);
          setReview(null);
        }}
        onDiscard={() => setReview(null)}
      />
    </>
  );
}

/**
 * A large change, shown in full before it happens.
 *
 * The threshold is the person's attention rather than a size: two lines
 * tightened is something they scan, and the summary rewritten with four bullets
 * reordered is something they read. Put in the change list, the second gets
 * applied unread — which is how somebody ends up sending a CV they have not
 * seen.
 *
 * The score is here because it is the number the whole screen is about, and
 * "does this actually help" is the question a big rewrite raises.
 */
function ReviewDialog({
  response,
  score,
  onApply,
  onDiscard,
}: {
  response: AgentResponse | null;
  score: { before: number; after: number } | null;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <AnimatePresence>
      {response && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onDiscard}
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Review this change"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={SPRING}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(88dvh,48rem)] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-raised shadow-hero ring-1 ring-ink/10"
          >
            <header className="border-b border-hairline px-5 py-4">
              <h2 className="font-display text-lg font-semibold text-ink">
                {response.edits.length} changes, before they happen
              </h2>
              <p className="pt-1 text-sm leading-relaxed text-slate">{response.reply}</p>

              {score && (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-sunken px-3.5 py-2.5">
                  <span className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                    Match
                  </span>
                  <span className="font-display text-lg text-slate" data-numeric>
                    {score.before}%
                  </span>
                  <svg aria-hidden viewBox="0 0 24 24" className="size-4 text-slate" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0-6-6m6 6-6 6" />
                  </svg>
                  <span
                    className={cn(
                      "font-display text-lg font-semibold",
                      score.after > score.before
                        ? "text-signal"
                        : score.after < score.before
                          ? "text-danger"
                          : "text-ink",
                    )}
                    data-numeric
                  >
                    {score.after}%
                  </span>
                  {score.after === score.before && (
                    <span className="text-2xs text-slate">
                      no change to the terms this post is scored on
                    </span>
                  )}
                </div>
              )}
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {response.edits.map((edit, index) => (
                <div key={index} className="rounded-xl bg-sunken p-3.5 ring-1 ring-hairline">
                  <div className="flex items-center gap-2 pb-2">
                    <span
                      className={cn(
                        "rounded-pill px-2 py-0.5 font-display text-2xs font-medium",
                        edit.kind === "add"
                          ? "bg-signal-soft text-signal"
                          : edit.kind === "remove"
                            ? "bg-danger-soft text-danger"
                            : "bg-amber-soft text-amber-ink",
                      )}
                    >
                      {
                        {
                          add: "New line",
                          remove: "Removed",
                          move: "Moved",
                          replace: "Rewritten",
                        }[edit.kind]
                      }
                    </span>
                    <span className="min-w-0 flex-1 truncate text-2xs text-slate">
                      {edit.reason}
                    </span>
                  </div>

                  {/* An addition has nothing to compare against, so it is not
                      shown as a diff — a struck-through empty line reads as a
                      deletion that did not happen. */}
                  {edit.kind === "replace" && edit.before && (
                    <p className="cv-literal pb-1.5 text-2xs leading-relaxed text-slate line-through decoration-slate/40">
                      {edit.before}
                    </p>
                  )}

                  {/* A removal shows the line it takes, in full and not
                      truncated. It is the only operation whose result cannot be
                      read afterwards, because afterwards the line is gone —
                      this is the last chance anybody has to look at it. */}
                  {edit.kind === "remove" ? (
                    <p className="cv-literal rounded-sm bg-danger-soft/60 px-2 py-1.5 text-2xs leading-relaxed text-ink line-through decoration-danger/40">
                      {edit.before}
                    </p>
                  ) : edit.kind === "move" ? (
                    <p className="cv-literal rounded-sm bg-sunken px-2 py-1.5 text-2xs leading-relaxed text-ink">
                      {edit.before || "This line"}
                    </p>
                  ) : (
                    <p className="cv-literal mark-change rounded-sm px-2 py-1.5 text-2xs leading-relaxed text-ink">
                      {edit.after}
                    </p>
                  )}
                </div>
              ))}

              {response.refused.length > 0 && (
                <div className="rounded-xl bg-amber-soft/60 p-3.5">
                  <p className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-amber-ink">
                    Not done
                  </p>
                  <ul className="space-y-1.5 pt-2">
                    {response.refused.map((item, index) => (
                      <li key={index} className="text-2xs leading-relaxed text-ink/80">
                        <span className="font-medium">{item.what}</span> — {item.why}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* flex-wrap: at 320px "Leave it" and "Add these N changes" are
                wider together than the dialog, and a row that cannot wrap
                pushes the apply button past the edge. */}
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-4 py-3.5 sm:px-5">
              <button
                type="button"
                onClick={onDiscard}
                className="inline-flex h-10 items-center rounded-pill px-4 font-display text-sm text-slate transition-colors hover:bg-sunken hover:text-ink"
              >
                Leave it
              </button>
              <button
                type="button"
                onClick={onApply}
                className="inline-flex h-10 items-center rounded-pill bg-signal px-5 font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
              >
                Add these {response.edits.length} changes
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
