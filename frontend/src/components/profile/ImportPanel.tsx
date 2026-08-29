"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE, SPRING } from "@/components/motion/primitives";
import { ApiError, extractProfile, ingestFile, ingestPaste } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CareerProfile, ProfileConflict } from "@/lib/types";

/**
 * Reading a CV into the profile.
 *
 * Nobody fills in forty fields from an empty page. They do correct forty fields
 * that are already mostly right, which is the whole reason this exists: the
 * form stops being something to compose and becomes something to check.
 *
 * Two things it is careful about, and both are about not being trusted too far.
 *
 * **It proposes, it does not save.** The extraction comes back into the form
 * unsaved, so a model's reading of a PDF only becomes somebody's career history
 * once they have looked at it and pressed Save.
 *
 * **It adds rather than replaces.** An achievement written by hand must survive
 * a newer CV being uploaded. Where the CV and the profile disagree the existing
 * value stands and the disagreement is shown, because only the person knows
 * which is right. Replacing is available and is a separate, deliberate choice.
 */
export function ImportPanel({
  onImported,
  startOpen = false,
}: {
  onImported: (profile: CareerProfile, completeness: number) => void;
  /** Open on arrival — set straight after signing up, where this is the point. */
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);
  const [result, setResult] = useState<{
    added: string[];
    conflicts: ProfileConflict[];
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const run = async () => {
    setError(null);
    setResult(null);
    try {
      setBusy("Reading your CV…");
      const parsed = file ? await ingestFile(file) : await ingestPaste(text);

      setBusy("Working out what it says about you…");
      const extracted = await extractProfile(parsed.document, mode);

      onImported(extracted.profile, extracted.completeness);
      setResult({ added: extracted.added, conflicts: extracted.conflicts });
      setFile(null);
      setText("");
    } catch (caught) {
      setError({
        message: caught instanceof ApiError ? caught.message : "That did not work.",
        hint: caught instanceof ApiError ? caught.hint : "Try again in a moment.",
      });
    } finally {
      setBusy(null);
    }
  };

  const ready = Boolean(file || text.trim().length > 40);

  return (
    <div className="overflow-hidden rounded-2xl bg-raised shadow-float ring-1 ring-ink/5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-sunken/50 sm:p-5"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-signal-soft text-signal">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-semibold text-ink">
            Fill this in from a CV
          </span>
          <span className="block pt-0.5 text-2xs leading-relaxed text-slate">
            Drop a resume and Aptly reads it into the fields below. You check it
            before anything is saved.
          </span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={cn("size-4 shrink-0 text-slate transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
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
            <div className="border-t border-hairline p-4 sm:p-5">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped) {
                    setFile(dropped);
                    setText("");
                  }
                }}
                className={cn(
                  "rounded-xl ring-1 transition-colors",
                  dragging ? "ring-2 ring-signal" : "ring-hairline",
                )}
              >
                {file ? (
                  <div className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-medium text-ink">
                        {file.name}
                      </p>
                      <p className="text-2xs text-slate">Ready to read</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="shrink-0 rounded-pill px-3 py-1.5 font-display text-2xs text-slate transition-colors hover:bg-sunken hover:text-ink"
                    >
                      Replace
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <textarea
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                      placeholder="Paste your CV here, or drop a .docx, .pdf or .tex file anywhere in this box."
                      spellCheck={false}
                      className="min-h-[min(11rem,32dvh)] w-full resize-y rounded-xl bg-sunken px-4 py-3 text-[1rem] leading-relaxed text-ink placeholder:text-slate/45 focus:outline-none focus:ring-2 focus:ring-signal sm:text-sm"
                    />
                    {!text && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-4 pb-3">
                        <span className="text-2xs text-slate/70">or</span>
                        <button
                          type="button"
                          onClick={() => input.current?.click()}
                          className="pointer-events-auto rounded-xs px-2 py-1 font-display text-2xs text-signal underline decoration-signal/30 underline-offset-2 transition-colors hover:bg-signal-soft hover:decoration-signal"
                        >
                          choose a file
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <input
                  ref={input}
                  type="file"
                  accept=".docx,.pdf,.tex,.txt,.md"
                  className="sr-only"
                  onChange={(event) => {
                    const chosen = event.target.files?.[0];
                    if (chosen) {
                      setFile(chosen);
                      setText("");
                    }
                    event.target.value = "";
                  }}
                />
              </div>

              {/* Merge is the default and replace is a deliberate choice: the
                  cost of a wrong merge is a duplicate row somebody deletes, and
                  the cost of a wrong replace is work they cannot get back. */}
              <div className="flex flex-wrap gap-2 pt-4">
                {(
                  [
                    ["merge", "Add to what is here", "Keeps everything you have written."],
                    ["replace", "Start again from this CV", "Discards the profile you have now."],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    aria-pressed={mode === value}
                    className={cn(
                      "min-w-[12rem] flex-1 rounded-xl px-3.5 py-3 text-left ring-1 transition-colors",
                      mode === value
                        ? "bg-signal-soft ring-signal"
                        : "ring-hairline hover:bg-sunken",
                    )}
                  >
                    <span
                      className={cn(
                        "block font-display text-sm font-medium",
                        mode === value ? "text-signal" : "text-ink",
                      )}
                    >
                      {label}
                    </span>
                    <span className="block pt-0.5 text-2xs leading-relaxed text-slate">
                      {hint}
                    </span>
                  </button>
                ))}
              </div>

              {error && (
                <div className="mt-4 rounded-lg bg-danger-soft px-4 py-3">
                  <p className="text-sm font-medium text-danger">{error.message}</p>
                  {error.hint && <p className="pt-0.5 text-2xs text-slate">{error.hint}</p>}
                </div>
              )}

              <button
                type="button"
                onClick={() => void run()}
                disabled={!ready || Boolean(busy)}
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-pill bg-signal font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover disabled:opacity-45"
              >
                {busy ?? "Read this CV"}
              </button>

              <AnimatePresence>
                {result && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="mt-4 grid gap-3"
                  >
                    {/* Saying what it did. An extraction that worked and one
                        that found nothing look identical without this. */}
                    <div className="rounded-lg bg-signal-soft px-4 py-3">
                      <p className="font-display text-2xs font-semibold uppercase tracking-[0.1em] text-signal">
                        {result.added.length
                          ? `${result.added.length} added`
                          : "Nothing new to add"}
                      </p>
                      <p className="pt-1.5 text-2xs leading-relaxed text-ink/80">
                        {result.added.length
                          ? `${result.added.slice(0, 6).join(" · ")}${result.added.length > 6 ? ` · and ${result.added.length - 6} more` : ""}`
                          : "Everything in that CV was already on your profile."}
                      </p>
                      <p className="pt-2 text-2xs leading-relaxed text-slate">
                        Nothing is saved yet — check the sections below, then
                        press Save changes.
                      </p>
                    </div>

                    {result.conflicts.length > 0 && (
                      <div className="rounded-lg bg-amber-soft px-4 py-3">
                        <p className="font-display text-2xs font-semibold uppercase tracking-[0.1em] text-amber-ink">
                          {result.conflicts.length} disagreement
                          {result.conflicts.length === 1 ? "" : "s"}
                        </p>
                        <p className="pt-1.5 text-2xs leading-relaxed text-ink/80">
                          This CV says something different from what is on file.
                          What you had has been kept — change it below if the CV
                          is right.
                        </p>
                        <ul className="space-y-1.5 pt-2.5">
                          {result.conflicts.slice(0, 5).map((conflict) => (
                            <li key={conflict.field} className="text-2xs leading-relaxed">
                              <span className="font-medium text-ink">{conflict.label}: </span>
                              <span className="text-slate">kept </span>
                              <span className="text-ink">“{conflict.existing}”</span>
                              <span className="text-slate"> · CV said </span>
                              <span className="text-amber-ink">“{conflict.incoming}”</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
