"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { formatWhen } from "@/components/library/RecordRow";
import { cn, motionTokens } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  type RecordDetail,
  type RecordStatus,
} from "@/lib/types";

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
                "rounded-pill px-2.5 py-1 font-display text-2xs transition-colors",
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
              {record.cv_versions.map((version) => (
                <li
                  key={version.id}
                  className="flex items-baseline justify-between gap-3 rounded-lg bg-sunken px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm text-ink">
                      {version.filename}
                    </p>
                    <p className="cv-literal pt-0.5 text-2xs text-slate">
                      {version.content_hash.slice(0, 16) || "no hash"}…
                    </p>
                  </div>
                  <span className="shrink-0 text-2xs text-slate" data-numeric>
                    {version.change_count}{" "}
                    {version.change_count === 1 ? "change" : "changes"}
                  </span>
                </li>
              ))}
            </ul>
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
