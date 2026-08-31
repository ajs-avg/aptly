"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE, SPRING } from "@/components/motion/primitives";
import { ApiError, askAgent } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  AgentEdit,
  AgentResponse,
  AgentTurn,
  CVDocument,
} from "@/lib/types";

/**
 * Say what you want changed, and watch it happen.
 *
 * Somebody looking at a finished CV has opinions no set of buttons anticipates
 * — "this is too long", "lead with the deployment thing", "the summary sounds
 * like everyone else's". Until now the answers were the change cards the model
 * happened to produce and a text field per line. This is the third.
 *
 * ── One per document ────────────────────────────────────────────────────────
 *
 * Each panel talks to the agent for the CV it sits under, and that agent cannot
 * see the other document. The two are separate arguments for the same person,
 * and an agent holding both would spend its turns offering to make them match.
 *
 * What crosses between them is what the *person* said: a GitHub link given to
 * one is a fact about them, not about a document, and the other should not have
 * to be told again. It rides in `facts`, which this page owns and hands to
 * both, and which is gone when the tab is.
 *
 * ── Small changes land; large ones are read first ───────────────────────────
 *
 * A tightened line joins the change list like every other suggestion. Three
 * lines rewritten at once is something to read before it happens, so it opens
 * as a review — with the score the job post gives before and after, because
 * that is the number the whole screen is about.
 */
export function AgentPanel({
  side,
  document,
  jobText,
  facts,
  onFacts,
  onEdits,
  scoreFor,
}: {
  side: "tailored" | "rebuilt";
  document: CVDocument | null;
  jobText: string;
  /** Shared with the other agent. Held by the page, never stored. */
  facts: Record<string, string>;
  onFacts: (facts: Record<string, string>) => void;
  /** Accepted edits, for the page to turn into change cards. */
  onEdits: (edits: AgentEdit[]) => void;
  /** What this CV would score if the edits were applied. */
  scoreFor: (edits: AgentEdit[]) => { before: number; after: number };
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<AgentTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A large change, waiting to be read. */
  const [review, setReview] = useState<AgentResponse | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, busy]);

  const send = async (text: string) => {
    const instruction = text.trim();
    if (!instruction || !document || busy) return;

    setDraft("");
    setError(null);
    setBusy(true);
    setHistory((current) => [...current, { role: "user", content: instruction }]);

    try {
      const response = await askAgent({
        document,
        jobText,
        instruction,
        history,
        facts,
        side,
      });

      setHistory((current) => [...current, { role: "agent", content: response.reply }]);
      onFacts(response.facts);

      // Small changes land in the review list the rest of the product uses.
      // Large ones are held here until they have been read.
      if (response.scale === "large" && response.edits.length) {
        setReview(response);
      } else if (response.edits.length) {
        onEdits(response.edits);
      }

      if (response.refused.length) {
        setHistory((current) => [
          ...current,
          {
            role: "agent",
            content: response.refused
              .map((item) => `I did not change “${item.what}”. ${item.why}`)
              .join("\n\n"),
          },
        ]);
      }
      if (response.questions.length) {
        setHistory((current) => [
          ...current,
          { role: "agent", content: response.questions.map((q) => `• ${q}`).join("\n") },
        ]);
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? [caught.message, caught.hint].filter(Boolean).join(" ")
          : "Aptly could not reach the server.",
      );
      // The instruction stays in the box: a failed send must not eat what they
      // typed.
      setDraft(instruction);
      setHistory((current) => current.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  if (!document) return null;

  return (
    <div className="border-t border-hairline">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-sunken/50 sm:px-5"
      >
        <span
          aria-hidden
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full",
            side === "rebuilt" ? "bg-amber-soft text-amber-ink" : "bg-signal-soft text-signal",
          )}
        >
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 6 3-3h9a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3z" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xs font-medium text-ink">
            Tell me what to change
          </span>
          <span className="block pt-0.5 text-2xs text-slate">
            Ask in your own words. Every change is yours to accept.
          </span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={cn("size-3.5 shrink-0 text-slate transition-transform", open && "rotate-90")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EASE}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 sm:px-5">
              {history.length === 0 && (
                <div className="pb-3">
                  <p className="pb-2 text-2xs leading-relaxed text-slate">
                    It can only write what you have already told it. Ask for
                    something it has no record of and it will say so — and tell
                    you what to say to change that.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Make the summary shorter",
                      "Lead with the deployment result",
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

              {history.length > 0 && (
                <div className="max-h-72 space-y-2.5 overflow-y-auto overscroll-contain pb-3">
                  {history.map((turn, index) => (
                    <div
                      key={index}
                      className={cn(
                        "max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed",
                        turn.role === "user"
                          ? "ml-auto bg-signal-soft text-ink"
                          : "bg-sunken text-ink",
                      )}
                    >
                      {turn.content}
                    </div>
                  ))}
                  {busy && (
                    <p className="text-2xs text-slate">Reading your CV…</p>
                  )}
                  <div ref={endRef} />
                </div>
              )}

              {error && (
                <p role="alert" className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-2xs text-danger">
                  {error}
                </p>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter sends; Shift+Enter is a new line. A CV instruction
                    // is one sentence far more often than it is a paragraph.
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send(draft);
                    }
                  }}
                  rows={1}
                  placeholder="Shorten the summary and lead with the ramp-time result…"
                  className="min-h-[2.75rem] flex-1 resize-y rounded-xl bg-sunken px-3.5 py-2.5 text-[1rem] leading-relaxed text-ink ring-1 ring-hairline placeholder:text-slate/45 focus:outline-none focus:ring-2 focus:ring-signal sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="grid size-11 shrink-0 place-items-center rounded-xl bg-signal text-paper transition-colors hover:bg-signal-hover disabled:opacity-40"
                  aria-label="Send"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m0 0-6-6m6 6-6 6" />
                  </svg>
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReviewDialog
        response={review}
        score={review ? scoreFor(review.edits) : null}
        onApply={() => {
          if (review) onEdits(review.edits);
          setReview(null);
        }}
        onDiscard={() => setReview(null)}
      />
    </div>
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
                          : "bg-amber-soft text-amber-ink",
                      )}
                    >
                      {edit.kind === "add" ? "New line" : "Rewritten"}
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
                  <p className="cv-literal mark-change rounded-sm px-2 py-1.5 text-2xs leading-relaxed text-ink">
                    {edit.after}
                  </p>
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

            <footer className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3.5">
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
