"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { ShapeThumbnail } from "@/components/visual/CvThumbnail";
import { EASE } from "@/components/motion/primitives";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { DuplicateGroup } from "@/lib/types";

/**
 * Applications filed twice, offered back as one.
 *
 * Saving both of a run's CVs used to open two Library rows for one job. The
 * save path no longer does that, but it only runs on new saves — so the rows
 * already filed that way are found here and put back together on request.
 *
 * Offered rather than done. An exact advert match is certain and a matching
 * company and role is a guess, and merging two genuinely separate
 * applications to one employer would lose a distinction the person made on
 * purpose. The two cases are worded differently for the same reason.
 */
export function MergeBanner({
  groups,
  busy,
  onMerge,
  onDismiss,
}: {
  groups: DuplicateGroup[];
  busy: boolean;
  onMerge: (group: DuplicateGroup) => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (groups.length === 0) return null;

  const rows = groups.reduce((sum, group) => sum + group.records.length, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={EASE}
      className="rounded-2xl bg-amber-soft p-3 ring-1 ring-amber/25 sm:p-4"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Stack />
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
          <span className="font-display font-semibold">
            {rows} applications look like {groups.length}{" "}
            {groups.length === 1 ? "job" : "jobs"}.
          </span>{" "}
          <span className="text-ink/75">
            Saving both CVs for one post used to open two rows. Putting them
            together keeps every CV and the advert as it was.
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onDismiss} disabled={busy}>
            Not now
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Review"}
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={EASE}
            className="overflow-hidden"
          >
            <div className="grid gap-2 pt-3">
              {groups.map((group, index) => (
                <Group
                  key={group.records.map((r) => r.id).join()}
                  group={group}
                  index={index}
                  busy={busy}
                  onMerge={() => onMerge(group)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Group({
  group,
  index,
  busy,
  onMerge,
}: {
  group: DuplicateGroup;
  index: number;
  busy: boolean;
  onMerge: () => void;
}) {
  const first = group.records[0];
  const title = [first.company, first.role].filter(Boolean).join(" · ") || "Untitled application";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...EASE, delay: index * 0.05 }}
      className="rounded-xl bg-raised p-3 ring-1 ring-ink/[0.06]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-medium text-ink">{title}</p>
          <p className="pt-0.5 text-2xs text-slate">
            {group.exact
              ? "The same advert, saved twice."
              : "Same company and role, different wording — is this one job?"}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={onMerge} disabled={busy}>
          {busy ? "Merging…" : "Make it one"}
        </Button>
      </div>

      {/* The CVs about to end up side by side on one record. */}
      <div className="flex items-end gap-2 pt-3">
        {group.records.map((record, i) => (
          <div key={record.id} className="flex items-end gap-2">
            {i > 0 && (
              <span aria-hidden className="pb-4 font-display text-sm text-slate/60">
                +
              </span>
            )}
            <div className="w-11">
              <ShapeThumbnail shape={record.cv_shape} className="w-full" />
              <p className="truncate pt-1 text-center text-[0.6rem] text-slate">
                {record.cv_count} {record.cv_count === 1 ? "CV" : "CVs"}
              </p>
            </div>
          </div>
        ))}
        <span aria-hidden className="pb-4 font-display text-sm text-slate/60">
          →
        </span>
        <div className="w-11 shrink-0">
          <div
            className={cn(
              "grid aspect-[1/1.3] place-items-center rounded-lg bg-signal-soft ring-1 ring-signal/30",
            )}
          >
            <span className="font-display text-sm font-semibold text-signal" data-numeric>
              {group.records.reduce((sum, r) => sum + r.cv_count, 0)}
            </span>
          </div>
          <p className="whitespace-nowrap pt-1 text-center text-[0.6rem] text-signal">
            one record
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/** Two sheets, becoming one. */
function Stack() {
  return (
    <svg aria-hidden viewBox="0 0 34 30" className="h-7 w-8 shrink-0">
      <rect x="2" y="5" width="14" height="20" rx="3" fill="var(--color-raised)" stroke="var(--color-amber)" strokeWidth="1.4" opacity="0.5" />
      <rect x="9" y="3" width="14" height="22" rx="3" fill="var(--color-raised)" stroke="var(--color-amber)" strokeWidth="1.4" />
      <path d="M26 10l4 4-4 4" stroke="var(--color-amber-ink)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
