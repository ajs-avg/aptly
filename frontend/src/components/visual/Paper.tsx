"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { CVDocument, ShapeLine, TextNode } from "@/lib/types";

/**
 * A CV as a sheet of paper, at any size.
 *
 * The Library used to draw each saved CV as grey bars — a silhouette — and at
 * card size a silhouette of a document is a wireframe, not a document. These
 * draw the words. The type is set in container units, so the same sheet is
 * legible at a card's width and a thumbnail's, and a person recognises their
 * own CV by its first lines rather than by the shape of them.
 */

const KIND: Record<ShapeLine["k"], string> = {
  n: "font-display text-[5.6cqw] font-semibold leading-[1.15] tracking-[-0.01em] text-ink",
  c: "pt-[0.6cqw] text-[2.9cqw] leading-[1.3] text-slate",
  h: "mt-[3.2cqw] border-b border-hairline pb-[0.8cqw] font-display text-[2.6cqw] font-medium uppercase leading-[1.2] tracking-[0.12em] text-slate",
  r: "pt-[1.8cqw] font-display text-[3.1cqw] font-medium leading-[1.3] text-ink/90",
  b: "pt-[1.2cqw] text-[3cqw] leading-[1.35] text-ink/75",
};

/** The paper itself: its surface, its proportion, its edge. */
function Surface({
  children,
  className,
  empty = false,
}: {
  children?: React.ReactNode;
  className?: string;
  empty?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "@container relative aspect-[1/1.3] overflow-hidden rounded-[2.5cqw] bg-raised ring-1 ring-hairline",
        empty ? "grid place-items-center" : "px-[8%] pb-[6%] pt-[9%]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Lines({ lines }: { lines: ShapeLine[] }) {
  return (
    <>
      {lines.map((line, i) =>
        line.t ? (
          <p key={i} className={cn("line-clamp-2", KIND[line.k])}>
            {line.k === "b" && (
              <span className="mr-[1.4cqw] inline-block size-[1.1cqw] translate-y-[-0.35cqw] rounded-full bg-slate/60 align-middle" />
            )}
            {line.t}
          </p>
        ) : (
          // A row saved before the words were kept: its width, as before.
          <span
            key={i}
            className={cn(
              "block rounded-[1px]",
              line.k === "n" ? "mt-[1cqw] h-[4cqw] bg-ink/70" : line.k === "h" || line.k === "r" ? "mt-[3cqw] h-[2.2cqw] bg-slate/70" : "mt-[1.6cqw] h-[1.8cqw] bg-hairline",
            )}
            style={{ width: `${Math.max(12, Math.min(100, line.w))}%` }}
          />
        ),
      )}
    </>
  );
}

/** A sheet from the first lines the Library list carries. */
export function PaperLines({
  lines,
  className,
  muted = false,
}: {
  lines: ShapeLine[] | undefined;
  className?: string;
  /** A sample rather than a saved CV: the paper stays solid, the ink fades. */
  muted?: boolean;
}) {
  if (!lines || lines.length === 0) {
    return (
      <Surface empty className={className}>
        <span className="px-2 text-center font-display text-[4cqw] leading-tight text-slate/60">
          no preview
        </span>
      </Surface>
    );
  }
  return (
    <Surface className={cn(muted && "[&>p]:opacity-50", className)}>
      <Lines lines={lines} />
    </Surface>
  );
}

const PREVIEW_LIMIT = 22;

/** The first lines of a full document, the way the server measures them. */
export function linesOf(doc: CVDocument, limit = PREVIEW_LIMIT): ShapeLine[] {
  const out: ShapeLine[] = [];
  const push = (text: string | null | undefined, k: ShapeLine["k"]) => {
    if (!text || !text.trim() || out.length >= limit) return;
    const t = text.trim().replace(/\s+/g, " ");
    out.push({ w: Math.max(12, Math.min(100, Math.round((t.length / 92) * 100))), k, t });
  };
  push(doc.contact?.name, "n");
  push([doc.contact?.email, doc.contact?.phone, doc.contact?.location].filter(Boolean).join(" · "), "c");
  for (const section of doc.sections ?? []) {
    if (out.length >= limit) break;
    if (section.kind === "header") continue;
    push(section.title, "h");
    for (const node of section.loose_nodes) push(node.text, "b");
    for (const entry of section.entries) {
      push([entry.role, entry.org].filter(Boolean).join(" · "), "r");
      for (const bullet of entry.bullets) push(bullet.text, "b");
    }
  }
  return out;
}

/** A sheet from the document itself, for where the whole thing is at hand. */
export function PaperDoc({
  document: doc,
  className,
  limit = PREVIEW_LIMIT,
}: {
  document: CVDocument | Record<string, never> | null | undefined;
  className?: string;
  limit?: number;
}) {
  const lines = useMemo(
    () => (doc && "sections" in doc ? linesOf(doc as CVDocument, limit) : undefined),
    [doc, limit],
  );
  return <PaperLines lines={lines} className={className} />;
}

/**
 * The frame a full-size document sits in: the paper, on the desk.
 *
 * Used wherever a whole CV is read — the opened record, the profile sheet, the
 * tailoring workspace — so a document is the same object on every screen.
 */
export function PaperFrame({
  children,
  className,
  tilt = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Resting on the desk rather than held up: a degree of lean, with its shadow. */
  tilt?: boolean;
}) {
  return (
    <div className={cn(tilt && "[perspective:1600px]", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-raised shadow-float ring-1 ring-hairline",
          tilt && "origin-top [transform:rotateX(1.2deg)] transition-transform duration-500 hover:[transform:rotateX(0deg)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The same document, readable.
 *
 * Plain typography rather than the editor's, because nothing here is editable.
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
                    <li key={bullet.id} className="flex gap-2 text-xs leading-relaxed text-ink/90">
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
