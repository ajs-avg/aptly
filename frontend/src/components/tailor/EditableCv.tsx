"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE, SPRING } from "@/components/motion/primitives";
import { isEditable } from "@/lib/document";
import { cn } from "@/lib/utils";
import type { Change, CVDocument, Section, TextNode } from "@/lib/types";

/**
 * The CV, as a document you can edit rather than a preview of one.
 *
 * Two things happen on the same line and that is the point: the AI's proposal
 * appears under it with Apply, and the line itself is typeable. Somebody who
 * disagrees with a suggestion should not have to accept it and then fix it, or
 * reject it and lose the idea — they should be able to write the version they
 * actually want, in place, and watch the score move.
 *
 * Only editable roles accept typing. A name, an employer, a job title and a set
 * of dates are facts about the person; the tailoring pass is never handed them
 * and neither is this. Making them look editable would invite exactly the edit
 * the whole product exists to prevent.
 */

interface Props {
  document: CVDocument;
  changes: Change[];
  editable: boolean;
  onApply: (nodeId: string) => void;
  onUndo: (nodeId: string, previousText: string) => void;
  onDismiss: (nodeId: string) => void;
  onEdit: (nodeId: string, text: string) => void;
  /**
   * Lines the agent just touched: scrolled to and glowed, so a change made by
   * something other than the person's own hands is never off-screen and silent.
   * The stamp makes the same lines pointable-at twice.
   */
  highlight?: { ids: string[]; stamp: number } | null;
  /**
   * The six-second read. A recruiter's first pass takes the headings, the
   * summary, and each role's first line; everything else waits for a second
   * read the first one has to earn. Dimming the rest shows which CV the skim
   * actually sends — usually not the one its owner has been reading.
   */
  skim?: boolean;
}

export function EditableCv({
  document,
  changes,
  editable,
  onApply,
  onUndo,
  onDismiss,
  onEdit,
  highlight = null,
  skim = false,
}: Props) {
  const byNode = new Map(changes.map((change) => [change.suggestion.node_id, change]));
  const rootRef = useRef<HTMLDivElement>(null);

  // The eye goes where the change went. The first touched line still in the
  // document is scrolled into view; the glow on each is rendered by the lines
  // themselves.
  useEffect(() => {
    if (!highlight || !rootRef.current) return;
    for (const id of highlight.ids) {
      const el = rootRef.current.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
  }, [highlight]);

  const glow = highlight ? new Set(highlight.ids) : null;

  return (
    <div ref={rootRef} className="px-4 py-4 sm:px-6 sm:py-5">
      {skim && (
        <p className="mb-3 rounded-lg bg-sunken px-3 py-2 text-2xs leading-relaxed text-slate">
          <span className="font-medium text-ink">The six-second read.</span> What
          stays bright is what a skimming recruiter takes in: your name, the
          headings, the summary, each role&rsquo;s first line. The dim lines are
          read only if the bright ones earn it.
        </p>
      )}
      <Header document={document} />
      {document.sections
        .filter((section) => section.kind !== "header")
        .map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            byNode={byNode}
            glow={glow}
            glowStamp={highlight?.stamp ?? 0}
            skim={skim}
            editable={editable}
            onApply={onApply}
            onUndo={onUndo}
            onDismiss={onDismiss}
            onEdit={onEdit}
          />
        ))}
    </div>
  );
}

function Header({ document }: { document: CVDocument }) {
  const { name, email, phone, location, links } = document.contact;
  const details = [email, phone, location].filter(Boolean);
  if (!name && details.length === 0) return null;

  return (
    <div className="pb-4 text-center">
      {name && <p className="font-display text-lg font-semibold text-ink">{name}</p>}
      {details.length > 0 && (
        <p className="pt-0.5 text-2xs text-slate">{details.join("  ·  ")}</p>
      )}
      {links.length > 0 && <p className="text-2xs text-slate">{links.join("  ·  ")}</p>}
    </div>
  );
}

function SectionBlock({
  section,
  byNode,
  glow,
  glowStamp,
  skim = false,
  editable,
  onApply,
  onUndo,
  onDismiss,
  onEdit,
}: {
  section: Section;
  byNode: Map<string, Change>;
  glow: Set<string> | null;
  glowStamp: number;
} & Omit<Props, "document" | "changes" | "highlight">) {
  const shared = { byNode, glow, glowStamp, editable, onApply, onUndo, onDismiss, onEdit };

  return (
    <section className="pt-4">
      {section.title && (
        <h3 className="border-b border-hairline pb-1 font-display text-2xs font-semibold uppercase tracking-[0.1em] text-ink">
          {section.title}
        </h3>
      )}

      {/* Loose lines — the summary, a skills list — are in the skim path:
          they sit at the top of their sections, which is where the eye goes. */}
      {section.loose_nodes.map((node) => (
        <Line key={node.id} node={node} {...shared} />
      ))}

      {section.entries.map((entry) => (
        <div key={entry.id} className="pt-2.5">
          {/* Facts, not prose. Rendered as text and never as an input. */}
          {entry.heading_nodes.map((node) => (
            <p key={node.id} className="text-sm font-medium text-ink">
              {node.text}
            </p>
          ))}
          {entry.bullets.map((node, index) => (
            <Line
              key={node.id}
              node={node}
              bullet
              // The first line of each role is read; the rest is skimmed past.
              dim={skim && index > 0}
              {...shared}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function Line({
  node,
  bullet = false,
  dim = false,
  byNode,
  glow,
  glowStamp,
  editable,
  onApply,
  onUndo,
  onDismiss,
  onEdit,
}: {
  node: TextNode;
  bullet?: boolean;
  /** Outside the six-second read — see the `skim` prop. */
  dim?: boolean;
  byNode: Map<string, Change>;
  glow: Set<string> | null;
  glowStamp: number;
} & Omit<Props, "document" | "changes" | "highlight" | "skim">) {
  const change = byNode.get(node.id);
  const canType = editable && isEditable(node);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Null when not editing, rather than a copy of `node.text` kept in step with
  // it. A mirrored draft needs an effect to resync — and while that effect is
  // pending it holds a stale line, so applying a suggestion and then opening
  // the editor silently reverts it. Holding the draft only while it exists
  // removes the second source of truth instead of synchronising it.
  const [draft, setDraft] = useState<string | null>(null);
  const typing = draft !== null;

  useEffect(() => {
    const area = areaRef.current;
    if (draft === null || !area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [draft]);

  const commit = () => {
    const next = (draft ?? "").trim();
    setDraft(null);
    if (next && next !== node.text) onEdit(node.id, next);
  };

  const pending = change?.status === "pending";
  const applied = change?.status === "applied";

  const glowing = glow?.has(node.id) ?? false;

  return (
    <div
      data-node-id={node.id}
      className={cn(
        "group/line relative pt-1.5 transition-opacity duration-300",
        dim && "opacity-25",
      )}
    >
      {/* The agent's mark: a wash that arrives bright and breathes out, over
          the whole line and whatever card it carries. An overlay rather than a
          class on the text, so re-triggering it never remounts a line somebody
          may be editing. */}
      <AnimatePresence>
        {glowing && (
          <motion.span
            key={glowStamp}
            aria-hidden
            className="pointer-events-none absolute -inset-x-1.5 -inset-y-0.5 rounded-md"
            style={{
              backgroundColor: "var(--color-signal-soft)",
              boxShadow: "0 0 0 1.5px var(--color-signal)",
            }}
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 2.6, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
      <div className="relative flex gap-2">
        {bullet && <span className="select-none pt-[3px] text-2xs text-slate">•</span>}

        <div className="min-w-0 flex-1">
          {typing ? (
            <textarea
              ref={areaRef}
              value={draft ?? ""}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  commit();
                }
                if (event.key === "Escape") setDraft(null);
              }}
              rows={1}
              className="w-full resize-none rounded-sm bg-signal-soft/60 px-1.5 py-0.5 text-sm leading-relaxed text-ink ring-1 ring-signal/30 focus:outline-none"
            />
          ) : (
            <motion.p
              // Amber flash on arrival, then a permanent left rule. The flash
              // alone faded to nothing, so a minute later there was no way to
              // see which lines had been changed — and the undo underneath them
              // read as belonging to the whole document rather than that line.
              key={node.text}
              initial={applied ? { backgroundColor: "var(--color-amber-soft)" } : false}
              animate={{ backgroundColor: "rgba(0,0,0,0)" }}
              transition={{ duration: 1.1, ease: "easeOut" }}
              onClick={canType ? () => setDraft(node.text) : undefined}
              className={cn(
                "rounded-sm text-sm leading-relaxed text-ink",
                applied && "mark-change pl-2",
                canType &&
                  "cursor-text px-1.5 py-0.5 transition-colors hover:bg-sunken hover:ring-1 hover:ring-hairline",
              )}
            >
              {node.text}
            </motion.p>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {pending && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={EASE}
            className="overflow-hidden"
          >
            <div className={cn("mt-1.5 rounded-md bg-amber-soft/60 p-2.5", bullet && "ml-4")}>
              <p className="cv-literal text-ink">{change!.suggestion.after}</p>
              <p className="pt-1.5 text-2xs leading-relaxed text-slate">
                {change!.suggestion.reason}
              </p>

              {change!.flags.length > 0 && (
                <p className="pt-1 text-2xs font-medium text-amber-ink">
                  {change!.flags.map((flag) => flag.detail).join(" · ")}
                </p>
              )}

              <div className="flex items-center gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => onApply(node.id)}
                  className="inline-flex h-7 items-center rounded-pill bg-signal px-3 font-display text-2xs font-medium text-paper transition-colors hover:bg-signal-hover"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(node.id)}
                  className="inline-flex h-7 items-center rounded-pill px-2.5 font-display text-2xs text-slate transition-colors hover:bg-sunken hover:text-ink"
                >
                  Skip
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {applied && change?.previousText && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
            className={cn("flex flex-wrap items-baseline gap-x-2 pt-1", bullet && "ml-4")}
          >
            <span className="font-display text-2xs font-medium uppercase tracking-[0.08em] text-amber-ink">
              Changed
            </span>
            {/* The line it replaced, struck through. Undo is far more useful
                when you can see what you are undoing to. */}
            <span className="cv-literal text-2xs text-slate line-through decoration-slate/40">
              {change.previousText.length > 90
                ? `${change.previousText.slice(0, 90)}…`
                : change.previousText}
            </span>
            <button
              type="button"
              onClick={() => onUndo(node.id, change.previousText!)}
              className="font-display text-2xs text-signal underline decoration-signal/30 underline-offset-2 transition-colors hover:decoration-signal"
            >
              Undo
            </button>
          </motion.div>
        )}

        {change?.status === "stale" && (
          <p className={cn("pt-1 text-2xs text-amber-ink", bullet && "ml-4")}>
            You edited this line, so that suggestion no longer applies.
          </p>
        )}
      </AnimatePresence>
    </div>
  );
}
