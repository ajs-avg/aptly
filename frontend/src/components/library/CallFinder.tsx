"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { PaperLines } from "@/components/visual/Paper";
import { ScoreRing } from "@/components/visual/ScoreRing";
import { EASE, SPRING } from "@/components/motion/primitives";
import { ApiError, findRecord } from "@/lib/api";
import { useClientValue } from "@/lib/browser";
import { formatWhen } from "@/lib/when";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, type FindCandidate, type FindResult } from "@/lib/types";

/**
 * Who's calling?
 *
 * The phone rings and the person has fifteen data-analyst applications
 * open. They type — or say — what they heard, the way they heard it, and
 * the Library answers with the application the caller means: the CV that
 * went, the advert, the notes, one tap from call mode.
 *
 * The answer always shows its working. Why it matched, how sure it is, and
 * the runners-up, so a wrong guess is a glance from being corrected rather
 * than silently trusted.
 */

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionCtor = new () => Recognition;

function recogniser(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const CONFIDENCE: Record<FindResult["confidence"], { label: string; tone: string }> = {
  sure: { label: "Sure", tone: "bg-signal text-paper" },
  likely: { label: "Most likely", tone: "bg-signal-soft text-signal" },
  unsure: { label: "Not sure — check the others", tone: "bg-amber-soft text-amber-ink" },
  none: { label: "No match", tone: "bg-sunken text-slate" },
};

export function CallFinder({
  onOpen,
  className,
}: {
  /** Open a record; `call` asks for call mode straight away. */
  onOpen: (id: string, call: boolean) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Whether this browser can listen. Read on the client only, so the server
  // and the first paint agree on there being no microphone button.
  const canListen = useClientValue(() => Boolean(recogniser()), false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const search = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await findRecord(trimmed));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Aptly could not search just now.");
    } finally {
      setBusy(false);
    }
  }, []);

  const listen = () => {
    const Ctor = recogniser();
    if (!Ctor) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = navigator.language?.startsWith("hi") ? "hi-IN" : "en-IN";
    r.interimResults = true;
    r.continuous = false;
    let heard = "";
    r.onresult = (event) => {
      heard = Array.from({ length: event.results.length }, (_, i) => event.results[i][0]?.transcript ?? "")
        .join(" ")
        .trim();
      setQuery(heard);
    };
    r.onend = () => {
      setListening(false);
      recognition.current = null;
      if (heard) void search(heard);
    };
    r.onerror = () => {
      setListening(false);
      recognition.current = null;
    };
    recognition.current = r;
    setListening(true);
    setResult(null);
    r.start();
  };

  const clear = () => {
    setQuery("");
    setResult(null);
    setError(null);
    input.current?.focus();
  };

  return (
    <section className={cn("rounded-2xl border border-hairline bg-raised/70 p-4 backdrop-blur-xl sm:p-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-2xs font-medium uppercase tracking-[0.12em] text-signal">
          When the phone rings
        </p>
        <p className="hidden text-2xs text-slate sm:block">
          Say it how you heard it — a name, a company, a role, when you applied.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search(query);
        }}
        className="relative mt-3"
      >
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={listening ? "Listening…" : "Who's calling? “Priya from Meridian, about the data analyst role”"}
          aria-label="Who is calling?"
          autoComplete="off"
          className={cn(
            "h-12 w-full rounded-pill bg-sunken pl-5 pr-[7.5rem] text-[1rem] text-ink ring-1 ring-hairline placeholder:text-slate/55 focus:outline-none focus:ring-signal sm:text-sm",
            listening && "ring-signal",
          )}
        />
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
          {query && !busy && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear"
              className="grid size-9 place-items-center rounded-full text-slate transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
          {canListen && (
            <button
              type="button"
              onClick={listen}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Say who is calling"}
              className={cn(
                "relative grid size-9 place-items-center rounded-full transition-colors",
                listening ? "bg-signal text-paper" : "text-slate hover:bg-white/[0.06] hover:text-ink",
              )}
            >
              {listening && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-signal"
                  initial={{ opacity: 0.5, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.8 }}
                  transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <svg viewBox="0 0 24 24" className="relative size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !query.trim()}
            className="inline-flex h-9 items-center rounded-pill bg-ink px-4 font-display text-xs font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Looking…" : "Find"}
          </button>
        </div>
      </form>

      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="pt-3 text-2xs text-danger"
          >
            {error}
          </motion.p>
        ) : result ? (
          <motion.div
            key={result.query}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING}
            className="pt-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-pill px-2.5 py-0.5 font-display text-2xs font-medium", CONFIDENCE[result.confidence].tone)}>
                {CONFIDENCE[result.confidence].label}
              </span>
              <p className="text-sm text-ink">{result.note}</p>
              {result.used_model && (
                <span className="text-2xs text-slate">· AI chose between close matches</span>
              )}
            </div>

            {result.best && (
              <Best candidate={result.best} onOpen={onOpen} />
            )}

            {result.others.length > 0 && (
              <div className="pt-3">
                <p className="pb-1.5 font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                  {result.best ? "Or this one?" : "Closest"}
                </p>
                <ul className="grid gap-1">
                  {result.others.map((candidate) => (
                    <Other key={candidate.record.id} candidate={candidate} onOpen={onOpen} />
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

/* ── The answer ─────────────────────────────────────────────────────────── */

function Best({
  candidate,
  onOpen,
}: {
  candidate: FindCandidate;
  onOpen: (id: string, call: boolean) => void;
}) {
  const { record, why } = candidate;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...EASE, delay: 0.05 }}
      className="mt-3 grid gap-4 rounded-xl bg-sunken p-3.5 ring-1 ring-signal/30 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center"
    >
      <button
        type="button"
        onClick={() => onOpen(record.id, false)}
        aria-label="Open this application"
        className="hidden w-[4.5rem] sm:block"
      >
        <PaperLines lines={record.cv_shape} className="w-full shadow-float" />
      </button>

      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-medium tracking-[-0.01em] text-ink">
              {record.company ?? record.role ?? "Untitled application"}
            </h3>
            <p className="truncate text-xs text-slate">
              {[record.role, record.location].filter(Boolean).join("  ·  ")}
            </p>
          </div>
          {record.score != null && <ScoreRing value={record.score} size={34} instant />}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <span className="rounded-pill bg-raised px-2 py-0.5 font-display text-2xs text-slate ring-1 ring-hairline">
            {STATUS_LABEL[record.status]}
          </span>
          <span className="text-2xs text-slate" data-numeric>
            {formatWhen(record.applied_at ?? record.created_at)}
          </span>
          {why.map((reason) => (
            <span
              key={reason}
              className={cn(
                "rounded-pill px-2 py-0.5 font-display text-2xs",
                reason.startsWith("AI:") ? "bg-signal-soft text-signal" : "bg-raised text-ink/80 ring-1 ring-hairline",
              )}
            >
              {reason}
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 gap-2 sm:flex-col">
        <button
          type="button"
          onClick={() => onOpen(record.id, true)}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-pill bg-signal px-4 font-display text-xs font-medium text-paper shadow-cta transition-colors hover:bg-signal-hover"
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5c0 8.284 6.716 15 15 15l2-4-4.5-2-2 2a11.05 11.05 0 0 1-6.5-6.5l2-2L8 3 4 5Z" />
          </svg>
          Call mode
        </button>
        <button
          type="button"
          onClick={() => onOpen(record.id, false)}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-pill bg-white/[0.06] px-4 font-display text-xs font-medium text-ink ring-1 ring-hairline transition-colors hover:bg-white/[0.1]"
        >
          Open
        </button>
      </div>
    </motion.div>
  );
}

function Other({
  candidate,
  onOpen,
}: {
  candidate: FindCandidate;
  onOpen: (id: string, call: boolean) => void;
}) {
  const { record, why } = candidate;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(record.id, false)}
        className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.04]"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">
            <span className="font-medium">{record.company ?? "Untitled"}</span>
            {record.role && <span className="text-slate">  ·  {record.role}</span>}
          </span>
          {why.length > 0 && (
            <span className="block truncate text-2xs text-slate">{why.join("  ·  ")}</span>
          )}
        </span>
        <span className="shrink-0 text-2xs text-slate" data-numeric>
          {formatWhen(record.applied_at ?? record.created_at)}
        </span>
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-slate" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
        </svg>
      </button>
    </li>
  );
}
