"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE, SPRING } from "@/components/motion/primitives";
import { getTemplates } from "@/lib/api";
import { allNodes } from "@/lib/document";
import { cn } from "@/lib/utils";
import type { CVDocument, CvTemplate, TargetFormat } from "@/lib/types";

/**
 * Choosing how the CV should look before it is downloaded.
 *
 * The dropdown this replaces offered five file formats and no layout, which
 * meant the most consequential thing about a downloaded CV — what it looks like
 * to the person reading it — was the one thing nobody was asked about. It was
 * whatever the parser had measured off the upload, or Aptly's default for a
 * paste.
 *
 * ── Two choices, not one ────────────────────────────────────────────────────
 *
 * **Layout** is the real decision and comes first. **Format** is the container
 * and comes second, smaller — and it only matters for .docx and .pdf, since
 * plain text and Markdown have no layout to set.
 *
 * ── The one that is not a layout ────────────────────────────────────────────
 *
 * "Keep my own formatting" appears only when there is a file to keep, and is
 * the default when there is. Choosing it is not a variation on the other
 * three: it is the difference between editing somebody's document and writing
 * a new one, and it is the promise the whole product is built on. A template
 * is them setting that aside deliberately — which is a different thing from us
 * setting it aside for them, and is why the trade is stated on the card rather
 * than buried.
 *
 * ── The preview ─────────────────────────────────────────────────────────────
 *
 * Built in the browser from the person's actual document and the chosen
 * template's typography, both of which come from the server. It is not a
 * picture of a sample CV: it is their name, their headings, their first
 * bullets, set the way the file will be set. Which is the only version of a
 * preview worth showing, because the question being answered is "what will
 * *mine* look like".
 */

const FORMATS: { value: TargetFormat; label: string; layout: boolean }[] = [
  { value: "pdf", label: "PDF", layout: true },
  { value: "docx", label: "Word", layout: true },
  { value: "txt", label: "Plain text", layout: false },
  { value: "md", label: "Markdown", layout: false },
  { value: "tex", label: "LaTeX", layout: false },
];

/** The sentinel for "do not set a template" — see the note above. */
const KEEP_MINE = "__keep__";

export function DownloadDialog({
  open,
  onClose,
  document,
  /** Whether there is an uploaded file whose formatting could be kept. */
  canKeepFormat,
  sourceFormat,
  onDownload,
}: {
  open: boolean;
  onClose: () => void;
  document: CVDocument | null;
  canKeepFormat: boolean;
  sourceFormat: string;
  onDownload: (format: TargetFormat, template: string | null) => void;
}) {
  const [templates, setTemplates] = useState<CvTemplate[]>([]);
  const [choice, setChoice] = useState<string>(canKeepFormat ? KEEP_MINE : "modern");
  const [format, setFormat] = useState<TargetFormat>(
    canKeepFormat ? (sourceFormat as TargetFormat) : "pdf",
  );

  useEffect(() => {
    if (!open) return;
    void getTemplates()
      .then(setTemplates)
      .catch(() => {
        // The dialog is still usable without them: "keep my formatting" and the
        // format buttons do not depend on this list.
      });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const keeping = choice === KEEP_MINE;
  const active = templates.find((template) => template.key === choice) ?? null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Download your CV"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.99 }}
            transition={SPRING}
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90dvh,52rem)] w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-raised shadow-hero ring-1 ring-ink/10"
          >
            <header className="flex items-start gap-4 border-b border-hairline px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-semibold text-ink">
                  How should it look?
                </h2>
                <p className="pt-1 text-sm leading-relaxed text-slate">
                  Every layout here is single-column with standard fonts and real
                  headings, so an applicant tracking system reads all of them the
                  same way. The difference is what a person sees.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-pill text-slate transition-colors hover:bg-sunken hover:text-ink [@media(pointer:coarse)]:w-11"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:overflow-hidden">
              {/* ── The choices ───────────────────────────────────────── */}
              <div className="min-w-0 space-y-2 border-hairline p-4 lg:overflow-y-auto lg:border-r">
                {canKeepFormat && (
                  <Choice
                    active={keeping}
                    onSelect={() => {
                      setChoice(KEEP_MINE);
                      setFormat(sourceFormat as TargetFormat);
                    }}
                    name="Keep my own formatting"
                    blurb={`Your ${sourceFormat.toUpperCase()}, with only the changed lines rewritten.`}
                    suits="Nothing else moves — fonts, spacing, margins and everything you set are exactly as you left them. This is the only option that edits your file rather than writing a new one."
                    badge="Recommended"
                  />
                )}

                {templates.map((template) => (
                  <Choice
                    key={template.key}
                    active={choice === template.key}
                    onSelect={() => {
                      setChoice(template.key);
                      if (!FORMATS.find((f) => f.value === format)?.layout) setFormat("pdf");
                    }}
                    name={template.name}
                    blurb={template.blurb}
                    suits={template.suits}
                  />
                ))}

                {canKeepFormat && !keeping && (
                  <p className="rounded-lg bg-amber-soft px-3 py-2.5 text-2xs leading-relaxed text-amber-ink">
                    A layout replaces your formatting rather than editing it. Your
                    words are unchanged; the design is Aptly&rsquo;s.
                  </p>
                )}
              </div>

              {/* ── What it will look like ────────────────────────────── */}
              <div className="min-w-0 bg-mist p-4 lg:overflow-y-auto">
                <Preview document={document} template={active} keeping={keeping} />
              </div>
            </div>

            <footer className="flex flex-wrap items-center gap-3 border-t border-hairline px-5 py-3.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <span className="pr-1 font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                  As
                </span>
                {FORMATS.filter((option) => keeping || option.layout || true).map((option) => {
                  // A layout has no meaning in plain text or Markdown, so those
                  // are offered but say what they drop.
                  const loses = !option.layout && !keeping;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormat(option.value)}
                      title={loses ? "No layout in this format — text only." : undefined}
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center rounded-pill px-3 font-display text-xs transition-colors",
                        format === option.value
                          ? "bg-ink text-paper"
                          : "text-slate hover:bg-sunken hover:text-ink",
                      )}
                    >
                      {option.label}
                      {loses && format === option.value && (
                        <span className="pl-1.5 text-2xs opacity-70">text only</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  onDownload(format, keeping ? null : choice);
                  onClose();
                }}
                className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-pill bg-signal px-5 font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
              >
                Download
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Choice({
  active,
  onSelect,
  name,
  blurb,
  suits,
  badge,
}: {
  active: boolean;
  onSelect: () => void;
  name: string;
  blurb: string;
  suits: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "relative w-full rounded-xl p-3 text-left ring-1 transition-colors",
        active ? "bg-signal-soft/50 ring-signal" : "bg-raised ring-hairline hover:bg-sunken/60",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "grid size-4 shrink-0 place-items-center rounded-full ring-1 transition-colors",
            active ? "bg-signal ring-signal" : "ring-hairline",
          )}
        >
          {active && <span className="size-1.5 rounded-full bg-paper" />}
        </span>
        <span className="font-display text-sm font-medium text-ink">{name}</span>
        {badge && (
          <span className="rounded-pill bg-signal-soft px-1.5 py-0.5 font-display text-2xs text-signal">
            {badge}
          </span>
        )}
      </span>
      <span className="block pl-6 pt-1 text-2xs leading-relaxed text-slate">{blurb}</span>
      {active && (
        <motion.span
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="block overflow-hidden pl-6 pt-1.5 text-2xs leading-relaxed text-slate/85"
        >
          {suits}
        </motion.span>
      )}
    </button>
  );
}

/**
 * The person's own CV, set the way the download will set it.
 *
 * Scaled type rather than real points: a page at 100% does not fit in a dialog,
 * and what is being judged is proportion — how big the name is against the
 * body, how much air a heading gets, whether there is a rule — all of which
 * survive being shrunk.
 */
function Preview({
  document,
  template,
  keeping,
}: {
  document: CVDocument | null;
  template: CvTemplate | null;
  keeping: boolean;
}) {
  if (!document) return null;

  const contact = document.contact;
  const sections = document.sections.filter((section) => section.kind !== "header").slice(0, 4);

  // Points to preview pixels. A CV page is 595pt wide and the preview is about
  // 340, so everything is set at a little over half size.
  const scale = 0.58;
  const body = (template?.body_size_pt ?? 10.5) * scale;
  const nameSize = (template?.name_size_pt ?? 20) * scale;
  const leading = template?.line_spacing ?? 1.15;
  const font = keeping
    ? "inherit"
    : `${template?.body_font ?? "Calibri"}, ui-sans-serif, system-ui, sans-serif`;

  return (
    <div className="mx-auto max-w-[26rem]">
      <p className="pb-2 text-center font-display text-2xs uppercase tracking-[0.1em] text-slate">
        {keeping ? "Your formatting, kept" : `${template?.name ?? "Preview"} — your CV`}
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={keeping ? "keep" : (template?.key ?? "none")}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={EASE}
          // The sheet, at roughly A4's proportions.
          className="aspect-[1/1.35] overflow-hidden rounded-md bg-white px-6 py-5 shadow-card ring-1 ring-ink/10"
          style={{ fontFamily: font, color: "#16181d" }}
        >
          {keeping ? (
            <KeptPreview document={document} />
          ) : (
            <>
              <p
                className="text-center font-semibold"
                style={{ fontSize: `${nameSize}px`, lineHeight: 1.15 }}
              >
                {contact.name ?? "Your name"}
              </p>
              <p
                className="text-center"
                style={{ fontSize: `${body * 0.92}px`, paddingTop: 2, opacity: 0.75 }}
              >
                {[contact.email, contact.phone, contact.location].filter(Boolean).join("  ·  ")}
              </p>

              {sections.map((section) => (
                <div key={section.id} style={{ paddingTop: (template?.heading_rule ? 9 : 11) }}>
                  <p
                    className="font-semibold uppercase"
                    style={{
                      fontSize: `${body * 1.02}px`,
                      letterSpacing: "0.06em",
                      paddingBottom: 2,
                      borderBottom: template?.heading_rule ? "1px solid #c9ccd2" : undefined,
                    }}
                  >
                    {section.title ?? section.kind}
                  </p>
                  <div style={{ paddingTop: 3 }}>
                    {allNodes({ ...document, sections: [section] })
                      .filter((node) => node.role !== "section_title")
                      .slice(0, 3)
                      .map((node) => (
                        <p
                          key={node.id}
                          style={{
                            fontSize: `${body}px`,
                            lineHeight: leading,
                            paddingBottom: 1.5,
                          }}
                        >
                          {node.role === "bullet" ? "• " : ""}
                          {node.text.slice(0, 96)}
                          {node.text.length > 96 ? "…" : ""}
                        </p>
                      ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <p className="pt-2.5 text-center text-2xs leading-relaxed text-slate">
        {keeping
          ? "Only the lines you changed are rewritten. Everything else is byte for byte your file."
          : "Single column, standard fonts, real headings — the shape an ATS reads cleanly."}
      </p>
    </div>
  );
}

/**
 * What "keep my formatting" previews as.
 *
 * Deliberately not a facsimile. We measured the person's fonts and spacing well
 * enough to write back into their file, not well enough to redraw it — and a
 * preview that is nearly their CV is worse than one that admits it is not,
 * because the difference is exactly what they would be checking for.
 */
function KeptPreview({ document }: { document: CVDocument }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-7"
        style={{ color: "#14655c" }}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13H7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
        <path strokeLinecap="round" d="M10 13h6M10 16.5h4" />
      </svg>
      <p style={{ fontSize: 12, fontWeight: 600 }}>{document.source_filename}</p>
      <p style={{ fontSize: 10.5, opacity: 0.62, maxWidth: "18rem", lineHeight: 1.5 }}>
        Your own document, unchanged apart from the lines you edited. There is
        nothing to preview here, because nothing about how it looks is ours.
      </p>
    </div>
  );
}
