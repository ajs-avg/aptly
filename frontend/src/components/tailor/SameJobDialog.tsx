"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

import { CvReadout, PaperDoc } from "@/components/visual/Paper";
import { EASE, SPRING } from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  VARIANT_LABEL,
  type CVDocument,
  type CvVariant,
  type RecordMatch,
} from "@/lib/types";

/**
 * Two CVs, one job, one question.
 *
 * A run finishes two documents and a person can reasonably approve both.
 * Saving them used to open two Library rows carrying the same job title, and
 * the Library's whole purpose is answering "which of these did I send" five
 * weeks later. So the second save asks, once, while both are still on screen
 * and the answer is still obvious.
 *
 * The two CVs are drawn rather than named. Both share a filename and a job
 * title; the only thing that tells them apart is what is on the page.
 *
 * Nothing is deleted either way. A CV that was not sent is still the work, and
 * a dialog that quietly discards one would be the one moment this product
 * threw away something true.
 */

interface Props {
  match: RecordMatch;
  /** The document about to be saved. */
  incoming: { document: CVDocument; variant: CvVariant; score: number | null };
  busy?: boolean;
  onCancel: () => void;
  /** `sent` is whether the incoming CV is the one that went to the employer. */
  onConfirm: (sent: boolean) => void;
}

export function SameJobDialog({ match, incoming, busy = false, onCancel, onConfirm }: Props) {
  const existing = match.record.cv_versions.at(-1) ?? null;
  const [choice, setChoice] = useState<"incoming" | "existing">("incoming");
  const [reading, setReading] = useState<"incoming" | "existing" | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The readout sits over the dialog, so Escape closes the top layer
      // first rather than throwing away the question underneath it.
      if (reading) setReading(null);
      else onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, reading]);

  const title = [match.record.company, match.record.role].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <motion.div
        className="absolute inset-0 bg-ink/35 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={EASE}
        onClick={onCancel}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="This job is already in your Library"
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={SPRING}
        className="relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-raised p-5 shadow-hero ring-1 ring-ink/[0.06] sm:p-7"
      >
        <p className="font-display text-2xs font-medium uppercase tracking-[0.12em] text-amber-ink">
          {match.exact ? "Already in your Library" : "Looks like the same job"}
        </p>
        <h2 className="pt-2 font-display text-xl font-semibold tracking-[-0.025em] text-ink">
          {match.exact
            ? "Which CV did you send?"
            : `Is this the same application as ${title || "the one you saved"}?`}
        </h2>
        <p className="max-w-lg pt-2 text-sm leading-relaxed text-slate">
          {match.exact
            ? "Both stay in your Library. Marking one means that five weeks from now you know which document the recruiter is holding."
            : "Saving here adds this CV to that application instead of opening a second row for the same job."}
        </p>

        <div className="grid gap-3 pt-6 sm:grid-cols-2">
          <Choice
            label="The one you just finished"
            variant={incoming.variant}
            score={incoming.score}
            document={incoming.document}
            selected={choice === "incoming"}
            onSelect={() => setChoice("incoming")}
            onRead={() => setReading("incoming")}
          />
          <Choice
            label="Saved earlier"
            variant={(existing?.variant as CvVariant | null) ?? null}
            score={match.record.score ?? null}
            document={existing?.doc_model ?? null}
            selected={choice === "existing"}
            onSelect={() => setChoice("existing")}
            onRead={() => setReading("existing")}
            note={existing ? `${existing.change_count} changes applied` : undefined}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-6">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onConfirm(choice === "incoming")} disabled={busy}>
            {busy ? "Saving…" : "Save to this application"}
          </Button>
        </div>

        <AnimatePresence>
          {reading && (
            <Readout
              document={
                reading === "incoming" ? incoming.document : (existing?.doc_model ?? null)
              }
              onClose={() => setReading(null)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function Choice({
  label,
  variant,
  score,
  document: doc,
  selected,
  onSelect,
  onRead,
  note,
}: {
  label: string;
  variant: CvVariant | null;
  score: number | null;
  document: CVDocument | Record<string, never> | null;
  selected: boolean;
  onSelect: () => void;
  onRead: () => void;
  note?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl p-3 ring-1 transition-colors",
        selected ? "bg-signal-soft ring-signal/40" : "bg-sunken/60 ring-ink/[0.06]",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex w-full items-start gap-3 text-left"
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ring-1 transition-colors",
            selected ? "bg-signal ring-signal" : "ring-slate/40",
          )}
        >
          {selected && <span className="size-1.5 rounded-full bg-paper" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-medium text-ink">{label}</span>
          <span className="block pt-0.5 text-2xs text-slate">
            {variant ? VARIANT_LABEL[variant] : "An earlier CV"}
            {score != null && <span data-numeric> · {score}%</span>}
          </span>
          {note && <span className="block pt-0.5 text-2xs text-slate/70">{note}</span>}
        </span>
      </button>

      <button
        type="button"
        onClick={onRead}
        className="group mt-3 block w-full"
        aria-label="Read this CV"
      >
        <PaperDoc
          document={doc}
          className="w-full transition-transform duration-200 group-hover:-translate-y-0.5"
        />
        <span className="block pt-2 text-center font-display text-2xs text-signal underline decoration-signal/30 underline-offset-2">
          Read it
        </span>
      </button>
    </div>
  );
}

/* The CV at a size you can actually read, over the dialog that asked. */
function Readout({
  document: doc,
  onClose,
}: {
  document: CVDocument | Record<string, never> | null;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-y-auto rounded-3xl bg-raised p-5 sm:p-7"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={EASE}
    >
      <div className="sticky top-0 flex justify-end bg-raised pb-3">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <CvReadout document={doc} />
    </motion.div>
  );
}
