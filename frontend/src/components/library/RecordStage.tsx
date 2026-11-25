"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/Button";
import { EditableCv } from "@/components/tailor/EditableCv";
import { PrepDeck } from "@/components/library/PrepDeck";
import { PaperFrame } from "@/components/visual/Paper";
import { Pipeline } from "@/components/visual/primitives";
import { ScoreRing } from "@/components/visual/ScoreRing";
import { SPRING } from "@/components/motion/primitives";
import { ApiError, interviewPrep } from "@/lib/api";
import { toPlainText } from "@/lib/document";
import { formatWhen } from "@/lib/when";
import { cn, motionTokens } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  VARIANT_LABEL,
  type CVDocument,
  type CvVariant,
  type CvVersionSummary,
  type InterviewPrep,
  type RecordDetail,
  type RecordStatus,
} from "@/lib/types";

/**
 * One saved application, taken off the shelf and laid on the desk.
 *
 * The CV that went out is the page, full size and readable, with the job post
 * beside it as it was on the day. Everything a person reaches for when the
 * phone rings — where it stands, what was said, what they asked for — sits in
 * the margin rather than in a panel the document has to be found inside.
 */

const ENDINGS = ["rejected", "withdrawn"] as const;
const PIPELINE = STATUS_ORDER.filter(
  (status): status is Exclude<RecordStatus, (typeof ENDINGS)[number]> =>
    !(ENDINGS as readonly string[]).includes(status),
);

/** Whether a stored version carries the document itself, not just its name. */
function storedDocument(version: CvVersionSummary): CVDocument | null {
  const model = version.doc_model;
  return model && "sections" in model ? (model as CVDocument) : null;
}

const quiet = { onApply: () => {}, onUndo: () => {}, onDismiss: () => {}, onEdit: () => {} };

interface Props {
  record: RecordDetail;
  onStatusChange: (status: RecordStatus) => void;
  onNotesChange: (notes: string) => void;
  onDelete: () => void;
  onClose: () => void;
  /** Say which of this record's CVs went to the employer. */
  onMarkSent?: (versionId: string) => void;
  /** Open with call mode already up — the phone is ringing. */
  initialCallMode?: boolean;
}

export function RecordStage({
  record,
  onStatusChange,
  onNotesChange,
  onDelete,
  onClose,
  onMarkSent,
  initialCallMode = false,
}: Props) {
  const [notes, setNotes] = useState(record.notes ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [prep, setPrep] = useState<InterviewPrep | null>(null);
  const [prepOpen, setPrepOpen] = useState(false);
  const [prepBusy, setPrepBusy] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [callMode, setCallMode] = useState(initialCallMode);
  const router = useRouter();

  /* The version on the desk: the sent one, else the newest that was stored. */
  const versions = record.cv_versions;
  const initial =
    versions.find((version) => version.sent && storedDocument(version)) ??
    [...versions].reverse().find((version) => storedDocument(version)) ??
    versions[0] ??
    null;
  const [currentId, setCurrentId] = useState<string | null>(initial?.id ?? null);
  const current = versions.find((version) => version.id === currentId) ?? initial;
  const document = current ? storedDocument(current) : null;

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
   * Back to the tailor screen, carrying this CV and advert.
   *
   * Through a sessionStorage note rather than state, because the tailor page
   * is a navigation away and this is one tab talking to itself.
   */
  const editInTailor = () => {
    if (!document) return;
    try {
      sessionStorage.setItem(
        "aptly-reopen",
        JSON.stringify({ jobText: record.snapshot?.raw ?? "", cvText: toPlainText(document) }),
      );
    } catch {
      // Private mode. The navigation still lands on the drop screen.
    }
    router.push("/tailor");
  };

  const commitNotes = () => notes !== (record.notes ?? "") && onNotesChange(notes);
  const keywords = record.snapshot?.parsed?.keywords ?? [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={SPRING}
    >
      {/* ── The top row: the way back, and the two things for the call. ── */}
      <div className="flex flex-wrap items-center gap-2 pb-5">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center gap-1.5 rounded-pill pl-2 pr-3.5 font-display text-xs font-medium text-slate transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
          </svg>
          All applications
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {document && (
            <Button size="sm" variant="ghost" onClick={editInTailor}>
              Edit in tailor →
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setCallMode(true)}>
            <Phone />
            Call mode
          </Button>
          <Button size="sm" onClick={() => void prepare()}>
            <Mic />
            Interview prep
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)] lg:gap-8">
        {/* ── The desk: the CV that went out ──────────────────────────── */}
        <div className="min-w-0">
          <header className="flex items-end justify-between gap-4 pb-4">
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-medium tracking-[-0.022em] text-ink sm:text-3xl">
                {record.company ?? "Untitled application"}
              </h2>
              <p className="pt-1 text-sm text-slate">
                {[record.role, record.location, `saved ${formatWhen(record.created_at)}`]
                  .filter(Boolean)
                  .join("  ·  ")}
              </p>
            </div>
            {record.snapshot?.score != null && (
              <div className="flex shrink-0 items-center gap-2.5">
                <ScoreRing value={record.snapshot.score} size={56} instant />
                <span className="hidden font-display text-2xs uppercase tracking-[0.1em] text-slate sm:block">
                  match
                  <br />
                  when sent
                </span>
              </div>
            )}
          </header>

          {/* Which document is on the desk. Two from one run share a filename,
              so they are named by what they are. */}
          {versions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pb-3">
              <div role="tablist" className="inline-flex items-center gap-0.5 rounded-pill bg-raised p-0.5 ring-1 ring-hairline">
                {versions.map((version) => {
                  const active = version.id === current?.id;
                  const variant = version.variant as CvVariant | null;
                  return (
                    <button
                      key={version.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setCurrentId(version.id)}
                      className="relative inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-pill px-3"
                    >
                      {active && (
                        <motion.span
                          layoutId="version-tab"
                          className="absolute inset-0 rounded-pill bg-signal-soft"
                          transition={SPRING}
                        />
                      )}
                      <span className={cn("relative font-display text-xs font-medium", active ? "text-signal" : "text-slate")}>
                        {variant ? VARIANT_LABEL[variant] : version.filename}
                      </span>
                      {version.sent && (
                        <span className="relative inline-flex items-center gap-0.5 rounded-pill bg-signal px-1.5 py-px font-display text-[10px] font-medium text-paper">
                          <Tick /> sent
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {current && !current.sent && onMarkSent && (
                <button
                  type="button"
                  onClick={() => onMarkSent(current.id)}
                  className="rounded-pill px-2.5 py-1 font-display text-2xs text-slate ring-1 ring-hairline transition-colors hover:bg-white/[0.06] hover:text-ink"
                >
                  I sent this one
                </button>
              )}
              {versions.length > 1 && !versions.some((v) => v.sent) && (
                <span className="text-2xs text-amber-ink">
                  Two CVs are here and neither is marked — say which went out.
                </span>
              )}
            </div>
          )}

          <PaperFrame tilt>
            {document ? (
              <EditableCv document={document} changes={[]} editable={false} {...quiet} />
            ) : (
              <p className="px-8 py-14 text-center text-sm text-slate">
                {versions.length === 0
                  ? "No CV was saved with this application."
                  : "Saved before Aptly kept the document itself — only its name and fingerprint are here."}
              </p>
            )}
          </PaperFrame>

          {current && (
            <p className="pt-3 text-2xs text-slate" data-numeric>
              {current.change_count} {current.change_count === 1 ? "change" : "changes"} applied ·
              saved {formatWhen(current.created_at)} ·{" "}
              <span className="cv-literal">{current.content_hash.slice(0, 12) || "no hash"}…</span>
            </p>
          )}
        </div>

        {/* ── The margin: where it stands, what was said, what they asked ── */}
        <aside className="space-y-4 lg:sticky lg:top-[calc(var(--spacing-bar)+1rem)] lg:self-start">
          <Card title="Where it stands">
            <Pipeline
              stages={PIPELINE.map((value) => ({ value, label: STATUS_LABEL[value] }))}
              current={record.status}
              onPick={(value) => onStatusChange(value as RecordStatus)}
            />
            <div className="flex flex-wrap items-center gap-1 pt-3">
              {ENDINGS.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onStatusChange(status)}
                  className={cn(
                    "inline-flex items-center rounded-pill px-2.5 py-1 font-display text-2xs transition-colors [@media(pointer:coarse)]:px-4",
                    status === record.status
                      ? "bg-danger-soft text-danger"
                      : "text-slate/70 hover:bg-white/[0.06] hover:text-ink",
                  )}
                >
                  {STATUS_LABEL[status]}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Notes">
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={commitNotes}
              rows={3}
              placeholder="Recruiter's name, what was said, when to follow up…"
              className="w-full resize-none rounded-lg bg-sunken px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-slate/55 focus:outline-none focus:ring-1 focus:ring-signal"
            />
          </Card>

          <Card title="The job post, as it was">
            {record.snapshot ? (
              <>
                <p className="text-2xs leading-relaxed text-slate">
                  Captured {formatWhen(record.snapshot.captured_at)} and never touched since.
                </p>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2.5">
                    {keywords.slice(0, 10).map((keyword) => (
                      <span key={keyword} className="rounded-xs bg-sunken px-1.5 py-0.5 font-display text-2xs text-slate">
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
                {/* The advert itself, as a second, smaller sheet. */}
                <pre className="cv-literal mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-sunken p-3 text-[11px] leading-relaxed text-slate ring-1 ring-hairline">
                  {record.snapshot.raw}
                </pre>
              </>
            ) : (
              <p className="text-sm text-slate">No snapshot was kept for this record.</p>
            )}
          </Card>

          <div className="px-1 pt-1">
            {confirmingDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xs text-slate">Delete this application for good?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </Button>
                <Button size="sm" variant="secondary" onClick={onDelete} className="text-danger ring-danger/25">
                  Delete
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(true)}>
                Delete this application
              </Button>
            )}
          </div>
        </aside>
      </div>

      {/* ── The preparation sheet ───────────────────────────────────────── */}
      <AnimatePresence>
        {prepOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPrepOpen(false)}
              className="fixed inset-0 z-50 bg-paper/60 backdrop-blur-sm"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Interview preparation"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: motionTokens.base, ease: motionTokens.easeOut }}
              className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90dvh,52rem)] w-[min(46rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-raised shadow-hero ring-1 ring-hairline"
            >
              <header className="border-b border-hairline px-5 py-4">
                <h2 className="font-display text-lg font-medium text-ink">Before the interview</h2>
                <p className="pt-0.5 text-2xs text-slate">
                  Built from the advert as it was and the CV you actually sent. Answers point only
                  at what your material says.
                </p>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
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
                {prep && <PrepDeck prep={prep} />}
              </div>
              <footer className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3.5 sm:px-5">
                {prep && (
                  <Button size="sm" variant="ghost" onClick={() => { setPrep(null); void prepare(); }}>
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

      {/* ── Call mode: the phone is ringing. One screen. ────────────────── */}
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
                <h2 className="truncate font-display text-xl font-medium text-ink">
                  {record.company ?? "This application"}
                </h2>
                <p className="pt-0.5 text-sm text-slate">
                  {[record.role, STATUS_LABEL[record.status]].filter(Boolean).join("  ·  ")}
                </p>
              </div>
              {record.snapshot?.score != null && (
                <ScoreRing value={record.snapshot.score} size={48} instant />
              )}
              <button
                type="button"
                onClick={() => setCallMode(false)}
                aria-label="Leave call mode"
                className="grid size-10 place-items-center rounded-pill text-slate transition-colors hover:bg-white/[0.06] hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_20rem]">
              <div className="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden">
                <div className="border-b border-hairline px-5 py-3 sm:px-8">
                  <p className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
                    The CV you sent
                  </p>
                </div>
                <div className="min-h-0 overflow-y-auto overscroll-contain">
                  {document ? (
                    <div className="mx-auto max-w-2xl">
                      <EditableCv document={document} changes={[]} editable={false} {...quiet} />
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
                  {keywords.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {keywords.slice(0, 12).map((keyword) => (
                        <span key={keyword} className="rounded-xs bg-sunken px-1.5 py-0.5 font-display text-2xs text-ink/80">
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
                  onBlur={commitNotes}
                  placeholder="Their name, what they said, what happens next…"
                  className="min-h-0 w-full resize-none bg-transparent px-5 py-3 text-sm leading-relaxed text-ink placeholder:text-slate/50 focus:outline-none"
                />
              </aside>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-raised p-4 ring-1 ring-hairline">
      <h3 className="pb-2.5 font-display text-2xs font-medium uppercase tracking-[0.08em] text-slate">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}

function Mic() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function Phone() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5c0 8.284 6.716 15 15 15l2-4-4.5-2-2 2a11.05 11.05 0 0 1-6.5-6.5l2-2L8 3 4 5Z" />
    </svg>
  );
}
