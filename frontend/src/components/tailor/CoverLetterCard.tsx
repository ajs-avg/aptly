"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE } from "@/components/motion/primitives";
import { ApiError, writeCoverLetter } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CoverLetter, CVDocument } from "@/lib/types";

/**
 * The cover letter, under the comparison where the space was.
 *
 * Written from the person's material by the same rule as everything else —
 * and the details a letter needs that their material cannot supply are not
 * guessed. They arrive as named blanks, with a small form beside the letter:
 * fill the form, watch the blanks fill, copy the whole thing. Nobody should
 * have to proof-read a page of prose hunting for what a model made up.
 */
export function CoverLetterCard({
  document,
  jobText,
}: {
  document: CVDocument | null;
  jobText: string;
}) {
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!document) return null;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const written = await writeCoverLetter({ document, jobText });
      setLetter(written);
      setValues({});
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? [caught.message, caught.hint].filter(Boolean).join(" ")
          : "Aptly could not reach the server.",
      );
    } finally {
      setBusy(false);
    }
  };

  /** The letter as it stands: filled blanks swapped in, empty ones kept visible. */
  const finalText = () => {
    if (!letter) return "";
    let text = letter.letter;
    for (const placeholder of letter.placeholders) {
      const value = values[placeholder.token]?.trim();
      text = text.split(placeholder.token).join(value || `[${placeholder.label}]`);
    }
    return text;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(finalText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permissions. The text is on screen to select by hand.
    }
  };

  const unfilled = letter
    ? letter.placeholders.filter((p) => !values[p.token]?.trim()).length
    : 0;

  return (
    <motion.section
      layout
      className="mt-3 overflow-hidden rounded-2xl bg-raised shadow-float ring-1 ring-ink/5"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-semibold text-ink">The cover letter</h2>
          <p className="pt-1 text-sm leading-relaxed text-slate">
            Written for this post from what your CV already proves — anything it
            cannot know is left as a blank for you, never guessed.
          </p>
        </div>
        {!letter && (
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="inline-flex h-9 shrink-0 items-center rounded-pill bg-signal px-4 font-display text-xs font-medium text-paper transition-colors hover:bg-signal-hover disabled:opacity-50"
          >
            {busy ? "Writing…" : "Write it for this job"}
          </button>
        )}
        {letter && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void generate()}
              disabled={busy}
              className="inline-flex h-8 items-center rounded-pill px-3 font-display text-xs text-ink ring-1 ring-ink/10 transition-colors hover:bg-sunken disabled:opacity-50"
            >
              {busy ? "Writing…" : "Rewrite"}
            </button>
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex h-8 items-center rounded-pill bg-ink px-3.5 font-display text-xs font-medium text-paper transition-colors hover:bg-ink-soft"
            >
              {copied ? "Copied ✓" : unfilled > 0 ? `Copy (${unfilled} blank)` : "Copy"}
            </button>
          </div>
        )}
      </header>

      {error && (
        <p role="alert" className="mx-4 mt-3 rounded-lg bg-danger-soft px-3 py-2 text-2xs text-danger sm:mx-5">
          {error}
        </p>
      )}

      <AnimatePresence initial={false}>
        {letter && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EASE}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-5 px-4 py-5 sm:px-5 lg:flex-row">
              {/* ── The letter ─────────────────────────────────────────── */}
              <div className="min-w-0 flex-1 space-y-3">
                {letter.letter.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index} className="text-sm leading-relaxed text-ink">
                    {renderParagraph(paragraph, letter, values)}
                  </p>
                ))}
              </div>

              {/* ── The blanks ─────────────────────────────────────────── */}
              {letter.placeholders.length > 0 && (
                <aside className="shrink-0 space-y-3 rounded-xl bg-sunken p-3.5 lg:w-72">
                  <p className="font-display text-2xs font-medium uppercase tracking-[0.08em] text-slate">
                    Fill the blanks
                  </p>
                  {letter.placeholders.map((placeholder) => (
                    <label key={placeholder.token} className="block">
                      <span className="block pb-1 text-2xs font-medium text-ink">
                        {placeholder.label}
                      </span>
                      <input
                        value={values[placeholder.token] ?? ""}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [placeholder.token]: event.target.value,
                          }))
                        }
                        placeholder={placeholder.hint || placeholder.label}
                        className="w-full rounded-lg bg-raised px-2.5 py-1.5 text-sm text-ink ring-1 ring-hairline placeholder:text-slate/45 focus:outline-none focus:ring-2 focus:ring-signal"
                      />
                      {placeholder.hint && (
                        <span className="block pt-1 text-2xs leading-relaxed text-slate">
                          {placeholder.hint}
                        </span>
                      )}
                    </label>
                  ))}
                  <p className="text-2xs leading-relaxed text-slate">
                    The letter fills in as you type. Nothing here is stored.
                  </p>
                </aside>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/**
 * A paragraph with its blanks live: filled ones land as marked text, empty
 * ones as amber chips naming what belongs there.
 */
function renderParagraph(
  paragraph: string,
  letter: CoverLetter,
  values: Record<string, string>,
): React.ReactNode {
  let parts: React.ReactNode[] = [paragraph];

  for (const placeholder of letter.placeholders) {
    parts = parts.flatMap((part) => {
      if (typeof part !== "string" || !part.includes(placeholder.token)) return [part];
      const value = values[placeholder.token]?.trim();
      return part.split(placeholder.token).flatMap((piece, index, all) =>
        index < all.length - 1
          ? [
              piece,
              <span
                key={`${placeholder.token}-${index}`}
                className={cn(
                  value
                    ? "mark-change rounded-sm px-0.5"
                    : "mx-0.5 rounded-pill bg-amber-soft px-2 py-0.5 font-display text-2xs font-medium text-amber-ink",
                )}
              >
                {value || placeholder.label}
              </span>,
            ]
          : [piece],
      );
    });
  }
  return parts;
}
