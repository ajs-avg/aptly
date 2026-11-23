"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { CVDocument, Section, ShapeLine, TextNode } from "@/lib/types";

/**
 * A saved CV, small enough to recognise at a glance.
 *
 * The Library's one job is answering "which CV did I send", and it was
 * answering it with a filename. Two documents from the same run share a
 * filename, so the answer was no answer at all. This draws the document
 * itself: the real headings, the real bullet lengths, the real shape of the
 * page.
 *
 * Deliberately not readable at thumbnail size, and deliberately the real
 * thing rather than a generic placeholder. A person recognises their own CV
 * by its silhouette — where the sections break, how long the skills line runs
 * — the same way they recognise a document in a Finder preview. Full size, in
 * the dialog and the panel, it becomes properly readable.
 */

/** A line as the thumbnail draws it: a width and a weight, nothing more. */
interface Line {
  /** Fraction of the column, 0–1. */
  w: number;
  kind: "name" | "contact" | "heading" | "role" | "body";
}

const CHARS_PER_LINE = 92;

function widthOf(text: string): number {
  if (!text) return 0;
  return Math.min(1, Math.max(0.12, text.trim().length / CHARS_PER_LINE));
}

function linesOfSection(section: Section, out: Line[], limit: number): void {
  if (out.length >= limit) return;
  if (section.title) out.push({ w: widthOf(section.title) * 0.55, kind: "heading" });

  for (const node of section.loose_nodes) {
    if (out.length >= limit) return;
    out.push({ w: widthOf(node.text), kind: node.role === "skill_line" ? "body" : "body" });
  }

  for (const entry of section.entries) {
    if (out.length >= limit) return;
    const heading = [entry.role, entry.org].filter(Boolean).join(" · ");
    if (heading) out.push({ w: Math.min(0.8, widthOf(heading) * 1.4), kind: "role" });
    for (const bullet of entry.bullets) {
      if (out.length >= limit) return;
      out.push({ w: widthOf(bullet.text), kind: "body" });
    }
  }
}

/** The document as a list of drawable lines, capped so one page is one page. */
function toLines(doc: CVDocument, limit: number): Line[] {
  const out: Line[] = [];
  if (doc.contact?.name) out.push({ w: 0.46, kind: "name" });
  const contact = [doc.contact?.email, doc.contact?.phone, doc.contact?.location]
    .filter(Boolean)
    .join(" · ");
  if (contact) out.push({ w: Math.min(0.72, widthOf(contact) * 1.2), kind: "contact" });

  for (const section of doc.sections ?? []) linesOfSection(section, out, limit);
  return out.slice(0, limit);
}

const TONE: Record<Line["kind"], string> = {
  name: "bg-ink/75",
  contact: "bg-slate/50",
  heading: "bg-slate",
  role: "bg-ink/70",
  body: "bg-hairline",
};

const HEIGHT: Record<Line["kind"], string> = {
  name: "h-[5%]",
  contact: "h-[2%]",
  heading: "h-[2.6%]",
  role: "h-[2.6%]",
  body: "h-[2%]",
};

/**
 * The same picture, drawn from the compact shape the Library list carries.
 *
 * The list shows dozens of records and the full document is a large object;
 * the server measures each CV once and sends the widths. The drawing stays
 * here so both paths produce the same picture.
 */
export function ShapeThumbnail({
  shape,
  className,
}: {
  shape: ShapeLine[] | undefined;
  className?: string;
}) {
  const lines = useMemo<Line[] | null>(() => {
    if (!shape || shape.length === 0) return null;
    return shape.map((line) => ({ w: line.w / 100, kind: KIND[line.k] ?? "body" }));
  }, [shape]);

  return <Sheet lines={lines} className={className} />;
}

const KIND: Record<string, Line["kind"]> = {
  n: "name",
  c: "contact",
  h: "heading",
  r: "role",
  b: "body",
};

export function CvThumbnail({
  document: doc,
  className,
  lines = 26,
}: {
  document: CVDocument | Record<string, never> | null | undefined;
  className?: string;
  /** How much of the page to draw. */
  lines?: number;
}) {
  const drawn = useMemo(() => {
    if (!doc || !("sections" in doc)) return null;
    return toLines(doc as CVDocument, lines);
  }, [doc, lines]);

  return <Sheet lines={drawn} className={className} />;
}

/** The page itself: a sheet of paper with lines on it. */
function Sheet({ lines, className }: { lines: Line[] | null; className?: string }) {
  if (!lines || lines.length === 0) {
    return (
      <div
        aria-hidden
        className={cn(
          "grid aspect-[1/1.3] place-items-center rounded-lg bg-sunken ring-1 ring-ink/[0.06]",
          className,
        )}
      >
        <span className="px-1 text-center font-display text-[0.6rem] leading-tight text-slate/60">
          no preview
        </span>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex aspect-[1/1.3] flex-col gap-[1.6%] overflow-hidden rounded-lg bg-raised p-[7%] ring-1 ring-ink/[0.08]",
        className,
      )}
    >
      {lines.map((line, i) => (
        <span
          key={i}
          className={cn(
            "shrink-0 rounded-[1px]",
            TONE[line.kind],
            HEIGHT[line.kind],
            // Headings sit against the margin with air above them, the way they
            // do on the page. Without it every line is one grey rhythm and the
            // silhouette stops being recognisable.
            (line.kind === "heading" || line.kind === "role") && i > 0 && "mt-[2.4%]",
          )}
          style={{ width: `${Math.round(line.w * 100)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * The same document, readable.
 *
 * Used where there is room to actually read it: the duplicate dialog, and the
 * Library panel when a thumbnail is opened. Plain typography rather than the
 * editor's, because nothing here is editable.
 */
export function CvReadout({
  document: doc,
  className,
}: {
  document: CVDocument | Record<string, never> | null | undefined;
  className?: string;
}) {
  if (!doc || !("sections" in doc)) {
    return (
      <p className={cn("text-sm text-slate", className)}>
        This CV was saved before Aptly kept the document itself.
      </p>
    );
  }
  const document_ = doc as CVDocument;

  return (
    <div className={cn("space-y-5", className)}>
      {document_.contact?.name && (
        <header className="text-center">
          <p className="font-display text-base font-semibold tracking-[-0.02em] text-ink">
            {document_.contact.name}
          </p>
          <p className="pt-1 text-2xs text-slate">
            {[document_.contact.email, document_.contact.phone, document_.contact.location]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </header>
      )}

      {(document_.sections ?? []).map((section) => (
        <section key={section.id}>
          {section.title && (
            <h4 className="hairline-b pb-1 font-display text-2xs font-semibold uppercase tracking-[0.1em] text-slate">
              {section.title}
            </h4>
          )}
          <div className="space-y-2 pt-2">
            {section.loose_nodes.map((node: TextNode) => (
              <p key={node.id} className="text-xs leading-relaxed text-ink">
                {node.text}
              </p>
            ))}
            {section.entries.map((entry) => (
              <div key={entry.id} className="pt-1">
                {(entry.role || entry.org) && (
                  <p className="font-display text-xs font-medium text-ink">
                    {[entry.role, entry.org].filter(Boolean).join(" · ")}
                    {(entry.start || entry.end) && (
                      <span className="pl-2 font-normal text-slate">
                        {[entry.start, entry.end].filter(Boolean).join(" – ")}
                      </span>
                    )}
                  </p>
                )}
                <ul className="space-y-1 pt-1">
                  {entry.bullets.map((bullet) => (
                    <li
                      key={bullet.id}
                      className="flex gap-2 text-xs leading-relaxed text-ink/90"
                    >
                      <span aria-hidden className="pt-1.5 text-slate">
                        <span className="block size-1 rounded-full bg-current" />
                      </span>
                      <span>{bullet.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
