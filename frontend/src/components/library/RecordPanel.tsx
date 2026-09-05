"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { formatWhen } from "@/components/library/RecordRow";
import { EditableCv } from "@/components/tailor/EditableCv";
import { ApiError, interviewPrep } from "@/lib/api";
import { toPlainText } from "@/lib/document";
import { cn, motionTokens } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  type CVDocument,
  type CvVersionSummary,
  type InterviewPrep,
  type RecordDetail,
  type RecordStatus,
} from "@/lib/types";

const KIND_LABEL: Record<InterviewPrep["questions"][number]["kind"], string> = {
  requirement: "From the post",
  cv: "About your CV",
  gap: "Where you may be pushed",
};

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
  /** The preparation sheet — held while the panel is open, never stored. */
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [prepOpen, setPrepOpen] = useState(false);
  const [prepBusy, setPrepBusy] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  /** Everything for the call, one screen. */
  const [callMode, setCallMode] = useState(false);
  const router = useRouter();

  const sentDocument = (() => {
    for (let index = record.cv_versions.length - 1; index >= 0; index -= 1) {
      const document = storedDocument(record.cv_versions[index]);
      if (document) return document;
    }
    return null;
  })();

  const prepare = async () => {
    setPrepOpen(true);
    if (prep || prepBusy) return;
    setPrepBusy(true);
    setPrepError(null);
    try {
      setPrep(await interviewPrep(record.id));
    } catch (caught) {
      setPrepError(
        caught instanceof ApiError
          ? [caught.message, caught.hint].filter(Boolean).join(" ")
          : "Aptly could not reach the server.",
      );
    } finally {
      setPrepBusy(false);
    }
  };

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

        {/* ── Before they call ──────────────────────────────────────────── */}
        <div className="px-6 pt-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void prepare()}
              className="inline-flex h-10 items-center gap-2 rounded-pill bg-signal px-4 font-display text-sm font-medium text-paper shadow-float transition-colors hover:bg-signal-hover"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
              Interview prep
            </button>
            <button
              type="button"
              onClick={() => setCallMode(true)}
              className="inline-flex h-10 items-center gap-2 rounded-pill px-4 font-display text-sm font-medium text-ink ring-1 ring-ink/10 transition-colors hover:bg-sunken"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5c0 8.284 6.716 15 15 15l2-4-4.5-2-2 2a11.05 11.05 0 0 1-6.5-6.5l2-2L8 3 4 5Z" />
              </svg>
              Call mode
            </button>
          </div>
          <p className="pt-2 text-2xs leading-relaxed text-slate">
            Prep reads the saved advert and the CV you sent; call mode puts both
            on one screen for when the phone rings.
          </p>
        </div>

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

      {/* ── The preparation sheet ─────────────────────────────────────────
          Three kinds of question, because three things get asked: what the
          post demands, what the CV invites, and where the two do not meet. */}
      <AnimatePresence>
        {prepOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPrepOpen(false)}
              className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Interview preparation"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: motionTokens.base, ease: motionTokens.easeOut }}
              className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90dvh,52rem)] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-raised shadow-hero ring-1 ring-ink/10"
            >
              <header className="border-b border-hairline px-5 py-4">
                <h2 className="font-display text-lg font-semibold text-ink">
                  Before the interview
                </h2>
                <p className="pt-0.5 text-2xs text-slate">
                  Built from the advert as it was and the CV you actually sent.
                  Answers point only at what your material says.
                </p>
              </header>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                {prepBusy && (
                  <div className="flex items-center gap-2 text-sm text-slate">
                    <motion.span
                      aria-hidden
                      className="inline-block size-1.5 rounded-full bg-slate"
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                    Reading the advert and your CV…
                  </div>
                )}
                {prepError && (
                  <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-2xs text-danger">
                    {prepError}
                  </p>
                )}

                {prep && (
                  <>
                    <div className="rounded-xl bg-signal-soft/60 p-3.5">
                      <p className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-signal">
                        Your opener
                      </p>
                      <p className="pt-1.5 text-sm leading-relaxed text-ink">{prep.opener}</p>
                    </div>

                    {(["requirement", "cv", "gap"] as const).map((kind) => {
                      const questions = prep.questions.filter((q) => q.kind === kind);
                      if (questions.length === 0) return null;
                      return (
                        <section key={kind}>
                          <h3 className="pb-2 font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                            {KIND_LABEL[kind]}
                          </h3>
                          <div className="space-y-3">
                            {questions.map((question, index) => (
                              <div
                                key={index}
                                className={cn(
                                  "rounded-xl p-3.5 ring-1 ring-hairline",
                                  kind === "gap" ? "bg-amber-soft/50" : "bg-sunken",
                                )}
                              >
                                <p className="text-sm font-medium leading-relaxed text-ink">
                                  “{question.question}”
                                </p>
                                <p className="pt-1 text-2xs leading-relaxed text-slate">
                                  {question.why}
                                </p>
                                <ul className="space-y-1 pt-2">
                                  {question.answer_points.map((point, pointIndex) => (
                                    <li
                                      key={pointIndex}
                                      className="flex gap-2 text-sm leading-relaxed text-ink/90"
                                    >
                                      <span aria-hidden className="select-none text-signal">
                                        ·
                                      </span>
                                      {point}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </>
                )}
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3.5 sm:px-5">
                {prep && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPrep(null);
                      void prepare();
                    }}
                  >
                    Rebuild
                  </Button>
                )}
                <Button size="sm" onClick={() => setPrepOpen(false)}>
                  Done
                </Button>
              </footer>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Call mode ─────────────────────────────────────────────────────
          The phone is ringing. One screen: what you sent, what they asked
          for, and somewhere to write what they say. Nothing to hunt for. */}
      <AnimatePresence>
        {callMode && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Call mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-paper"
          >
            <header className="flex items-center gap-4 border-b border-hairline px-5 py-4 sm:px-8">
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-display text-xl font-semibold text-ink">
                  {record.company ?? "This application"}
                </h2>
                <p className="pt-0.5 text-sm text-slate">
                  {[record.role, STATUS_LABEL[record.status]].filter(Boolean).join("  ·  ")}
                </p>
              </div>
              {record.snapshot?.score != null && (
                <span
                  className="rounded-pill bg-signal-soft px-3 py-1.5 font-display text-lg font-semibold text-signal"
                  data-numeric
                >
                  {record.snapshot.score}%
                </span>
              )}
              <button
                type="button"
                onClick={() => setCallMode(false)}
                aria-label="Leave call mode"
                className="grid size-10 place-items-center rounded-pill text-slate transition-colors hover:bg-sunken hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_20rem]">
              <div className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden">
                <div className="border-b border-hairline px-5 py-3 sm:px-8">
                  <p className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                    The CV you sent
                  </p>
                </div>
                <div className="min-h-0 overflow-y-auto overscroll-contain">
                  {sentDocument ? (
                    <div className="mx-auto max-w-2xl">
                      <EditableCv
                        document={sentDocument}
                        changes={[]}
                        editable={false}
                        onApply={() => {}}
                        onUndo={() => {}}
                        onDismiss={() => {}}
                        onEdit={() => {}}
                      />
                    </div>
                  ) : (
                    <p className="px-8 py-10 text-sm text-slate">
                      The document itself was not stored with this record.
                    </p>
                  )}
                </div>
              </div>

              <aside className="grid min-h-0 grid-rows-[auto_auto_1fr] overflow-hidden border-t border-hairline lg:border-l lg:border-t-0">
                <div className="px-5 py-4">
                  <p className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                    What they asked for
                  </p>
                  {record.snapshot?.parsed?.keywords?.length ? (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {record.snapshot.parsed.keywords.slice(0, 12).map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-xs bg-sunken px-1.5 py-0.5 font-display text-2xs text-ink/80"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="pt-2 text-2xs text-slate">No parsed advert on this record.</p>
                  )}
                </div>
                <div className="border-t border-hairline px-5 pt-4">
                  <p className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                    Notes, while you talk
                  </p>
                </div>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  onBlur={() => notes !== (record.notes ?? "") && onNotesChange(notes)}
                  placeholder="Their name, what they said, what happens next…"
                  className="min-h-0 w-full resize-none bg-transparent px-5 py-3 text-sm leading-relaxed text-ink placeholder:text-slate/50 focus:outline-none"
                />
              </aside>
            </div>
          </motion.div>
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
