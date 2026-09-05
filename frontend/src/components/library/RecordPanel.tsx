"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { formatWhen } from "@/components/library/RecordRow";
import { EditableCv } from "@/components/tailor/EditableCv";
import { toPlainText } from "@/lib/document";
import { cn, motionTokens } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  type CVDocument,
  type CvVersionSummary,
  type RecordDetail,
  type RecordStatus,
} from "@/lib/types";

/** Whether a stored version carries the document itself, not just its name. */
function storedDocument(version: CvVersionSummary): CVDocument | null {
  const model = version.doc_model;
  return model && "sections" in model ? (model as CVDocument) : null;
}

interface Props {
  record: RecordDetail;
  onStatusChange: (status: RecordStatus) => void;
  onNotesChange: (notes: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

/*
 * One saved application, opened.
 *
 * This is the ancestor of the Recruiter-Ready Card, and it earns its place the
 * same way: everything needed for the call, in the order it will be used. The
 * card itself comes later and gets the bold treatment — this stays quiet.
 */
export function RecordPanel({
  record,
  onStatusChange,
  onNotesChange,
  onDelete,
  onClose,
}: Props) {
  const [notes, setNotes] = useState(record.notes ?? "");
  const [showAdvert, setShowAdvert] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** The stored CV, opened to read. */
  const [viewing, setViewing] = useState<CvVersionSummary | null>(null);
  const router = useRouter();

  /**
   * Back to the tailor screen, carrying this record's CV and advert.
   *
   * Through a sessionStorage note rather than state, because the tailor page
   * is a navigation away and this is one tab talking to itself. The boxes come
   * up seeded; the run — and the agent with it — is one press from there.
   */
  const editInTailor = (version: CvVersionSummary) => {
    const document = storedDocument(version);
    if (!document) return;
    try {
      sessionStorage.setItem(
        "aptly-reopen",
        JSON.stringify({
          jobText: record.snapshot?.raw ?? "",
          cvText: toPlainText(document),
        }),
      );
    } catch {
      // Private mode. The navigation still lands on the drop screen.
    }
    router.push("/tailor");
  };

  return (
    <motion.div
      key={record.id}
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: motionTokens.base, ease: motionTokens.easeOut }}
      className="flex h-full flex-col"
    >
      <header className="hairline-b px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-medium tracking-tight text-ink">
              {record.company ?? "Untitled application"}
            </h2>
            {record.role && (
              <p className="pt-0.5 text-base text-slate">{record.role}</p>
            )}
            <p className="pt-1.5 text-2xs text-slate">
              {[record.location, `saved ${formatWhen(record.created_at)}`]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="lg:hidden"
          >
            Close
          </Button>
        </div>

        <div className="flex flex-wrap gap-1 pt-4">
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(status)}
              className={cn(
                "inline-flex items-center rounded-pill px-2.5 py-1 font-display text-2xs transition-colors",
                // See the Library's filter chips: a thumb-sized floor is a
                // vertical one, and a pill needs width to match it.
                "[@media(pointer:coarse)]:px-4",
                status === record.status
                  ? "bg-signal text-paper"
                  : "text-slate hover:bg-sunken hover:text-ink",
              )}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <Section title="The CV you sent">
          {record.cv_versions.length === 0 ? (
            <p className="text-sm text-slate">
              No CV was saved with this application.
            </p>
          ) : (
            <ul className="space-y-2">
              {record.cv_versions.map((version) => {
                const document = storedDocument(version);
                return (
                  <li key={version.id}>
                    <button
                      type="button"
                      onClick={document ? () => setViewing(version) : undefined}
                      disabled={!document}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg bg-sunken px-3 py-2 text-left",
                        document &&
                          "transition-colors hover:bg-signal-soft/40 hover:ring-1 hover:ring-signal/30",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm text-ink">
                          {version.filename}
                        </p>
                        <p className="cv-literal pt-0.5 text-2xs text-slate">
                          {version.content_hash.slice(0, 16) || "no hash"}…
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2">
                        {record.snapshot?.score != null && (
                          <span
                            className="rounded-pill bg-signal-soft px-2 py-0.5 font-display text-2xs font-medium text-signal"
                            data-numeric
                          >
                            {record.snapshot.score}% match
                          </span>
                        )}
                        <span className="text-2xs text-slate" data-numeric>
                          {version.change_count}{" "}
                          {version.change_count === 1 ? "change" : "changes"}
                        </span>
                        {document && (
                          <span className="font-display text-2xs text-signal">
                            Read →
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {record.cv_versions.some((v) => !storedDocument(v)) && (
            <p className="pt-2 text-2xs text-slate">
              Saved before Aptly kept the document itself — only the name and
              fingerprint are held for it.
            </p>
          )}
        </Section>

        <Section title="Notes">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() =>
              notes !== (record.notes ?? "") && onNotesChange(notes)
            }
            rows={3}
            placeholder="Recruiter's name, what was said, when to follow up…"
            className="w-full resize-none rounded-lg bg-sunken px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-slate/55 focus:outline-none focus:ring-1 focus:ring-signal"
          />
        </Section>

        <Section title="The job post, as it was">
          {record.snapshot ? (
            <>
              <p className="text-2xs leading-relaxed text-slate">
                Captured {formatWhen(record.snapshot.captured_at)} and never
                touched since. Postings come down; this copy does not.
              </p>

              {record.snapshot.parsed?.keywords?.length ? (
                <div className="flex flex-wrap gap-1 pt-2.5">
                  {record.snapshot.parsed.keywords
                    .slice(0, 10)
                    .map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-xs bg-sunken px-1.5 py-0.5 font-display text-2xs text-slate"
                      >
                        {keyword}
                      </span>
                    ))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setShowAdvert((open) => !open)}
                className="pt-3 font-display text-2xs text-signal underline decoration-signal/30 underline-offset-2 hover:decoration-signal"
              >
                {showAdvert ? "Hide the advert" : "Read the advert"}
              </button>

              {showAdvert && (
                <motion.pre
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{
                    duration: motionTokens.base,
                    ease: motionTokens.easeOut,
                  }}
                  className="cv-literal mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-sunken p-3 text-slate"
                >
                  {record.snapshot.raw}
                </motion.pre>
              )}
            </>
          ) : (
            <p className="text-sm text-slate">
              No snapshot was kept for this record.
            </p>
          )}
        </Section>

        <div className="px-6 py-5">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-2xs text-slate">
                Delete this application for good?
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onDelete}
                className="text-danger ring-danger/25"
              >
                Delete
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete this application
            </Button>
          )}
        </div>
      </div>

      {/* ── The stored CV, opened ─────────────────────────────────────────
          Exactly what was sent, rendered as a document rather than named as
          a file — with the way back: the same CV seeded into the tailor
          screen, where the agent and every editing tool are. */}
      <AnimatePresence>
        {viewing && storedDocument(viewing) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewing(null)}
              className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="The CV you sent"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: motionTokens.base, ease: motionTokens.easeOut }}
              className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90dvh,52rem)] w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-raised shadow-hero ring-1 ring-ink/10"
            >
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-5 py-4">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-lg font-semibold text-ink">
                    {viewing.filename}
                  </h2>
                  <p className="pt-0.5 text-2xs text-slate">
                    Sent {formatWhen(viewing.created_at)} · {viewing.change_count}{" "}
                    {viewing.change_count === 1 ? "change" : "changes"} applied
                  </p>
                </div>
                {record.snapshot?.score != null && (
                  <span
                    className="rounded-pill bg-signal-soft px-2.5 py-1 font-display text-sm font-semibold text-signal"
                    data-numeric
                  >
                    {record.snapshot.score}%
                  </span>
                )}
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <EditableCv
                  document={storedDocument(viewing)!}
                  changes={[]}
                  editable={false}
                  onApply={() => {}}
                  onUndo={() => {}}
                  onDismiss={() => {}}
                  onEdit={() => {}}
                />
              </div>

              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-4 py-3.5 sm:px-5">
                <Button size="sm" variant="ghost" onClick={() => setViewing(null)}>
                  Close
                </Button>
                <Button size="sm" onClick={() => editInTailor(viewing)}>
                  Edit in tailor →
                </Button>
              </footer>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="hairline-b px-6 py-5">
      <h3 className="pb-2.5 font-display text-2xs font-medium uppercase tracking-[0.07em] text-slate">
        {title}
      </h3>
      {children}
    </section>
  );
}
