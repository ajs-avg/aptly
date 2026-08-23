"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { CVDocument, TextNode } from "@/lib/types";

interface Props {
  document: CVDocument;
  /** The node the person is currently looking at a card for. */
  focusedId: string | null;
  /** Nodes changed since load, so the preview can show what moved. */
  changedIds: ReadonlySet<string>;
  /** The one node that changed most recently — it gets the amber flash. */
  justChangedId: string | null;
}

/**
 * The CV, live.
 *
 * Deliberately *not* a facsimile of the exported file. Reproducing the user's
 * Word template in the browser would be a second rendering engine to keep in
 * sync with the real one, and it would compete for attention with the change
 * cards. This is a clean reading view whose job is to show what changed and
 * where — the exported file keeps their formatting.
 */
export function CvPreview({
  document,
  focusedId,
  changedIds,
  justChangedId,
}: Props) {
  const { contact } = document;

  return (
    <article className="mx-auto max-w-[46rem] px-6 py-8 sm:px-10 sm:py-10">
      <header className="pb-5">
        {contact.name && (
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {contact.name}
          </h1>
        )}
        <p className="mt-1.5 text-sm text-slate">
          {[contact.email, contact.phone, contact.location]
            .filter(Boolean)
            .join("  ·  ")}
        </p>
        {contact.links.length > 0 && (
          <p className="mt-0.5 text-sm text-slate">
            {contact.links.join("  ·  ")}
          </p>
        )}
      </header>

      {document.sections
        .filter((section) => section.kind !== "header")
        .map((section) => (
          <section key={section.id} className="pt-6 first:pt-0">
            {section.title && (
              <h2 className="hairline-b pb-1.5 font-display text-2xs font-semibold uppercase tracking-[0.1em] text-signal">
                {section.title}
              </h2>
            )}

            <div className="pt-2.5">
              {section.loose_nodes.map((node) => (
                <Line
                  key={node.id}
                  node={node}
                  focused={node.id === focusedId}
                  changed={changedIds.has(node.id)}
                  flash={node.id === justChangedId}
                  className="py-1 text-base leading-relaxed"
                />
              ))}

              {section.entries.map((entry) => (
                <div key={entry.id} className="pt-3 first:pt-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h3 className="font-display text-base font-medium text-ink">
                      {[entry.role, entry.org].filter(Boolean).join(", ") ||
                        "—"}
                    </h3>
                    <span className="text-sm text-slate" data-numeric>
                      {[
                        entry.location,
                        [entry.start, entry.end].filter(Boolean).join(" – "),
                      ]
                        .filter(Boolean)
                        .join("  ·  ")}
                    </span>
                  </div>

                  <ul className="mt-1.5 space-y-1">
                    {entry.bullets.map((node) => (
                      <li key={node.id} className="flex gap-2.5">
                        <span
                          aria-hidden
                          className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate/50"
                        />
                        <Line
                          node={node}
                          focused={node.id === focusedId}
                          changed={changedIds.has(node.id)}
                          flash={node.id === justChangedId}
                          className="flex-1 text-base leading-relaxed"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
    </article>
  );
}

function Line({
  node,
  focused,
  changed,
  flash,
  className,
}: {
  node: TextNode;
  focused: boolean;
  changed: boolean;
  flash: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  // Bring the line into view when its card is focused, but never yank the page
  // around while the person is reading something else.
  useEffect(() => {
    if (!focused || !ref.current) return;
    const element = ref.current;
    const box = element.getBoundingClientRect();
    if (box.top < 80 || box.bottom > window.innerHeight - 80) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focused]);

  return (
    <p
      ref={ref}
      id={`node-${node.id}`}
      data-changed={changed || undefined}
      className={cn(
        "-mx-2 rounded-xs px-2 transition-colors duration-500",
        focused && "bg-sunken",
        // A settled change keeps a quiet teal edge: this line is now tailored.
        changed && !flash && "shadow-[inset_2px_0_0_var(--color-signal)]",
        // The moment of application: amber, then it fades to the teal above.
        flash &&
          "bg-amber-soft shadow-[inset_2px_0_0_var(--color-amber)] duration-150",
        className,
      )}
    >
      {node.text}
    </p>
  );
}
