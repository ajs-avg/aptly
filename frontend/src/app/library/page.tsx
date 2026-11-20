"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";

import { LibraryPulse } from "@/components/library/LibraryPulse";
import { RecordPanel } from "@/components/library/RecordPanel";
import { RecordCard } from "@/components/library/RecordCard";
import {
  EmptyLibraryArt,
  NoMatchArt,
  NothingSelectedArt,
} from "@/components/visual/illustrations";
import { AccountButton } from "@/components/marketing/AccountButton";
import { AppBar, BarLink } from "@/components/app/AppBar";
import { RequireAccount } from "@/components/auth/RequireAccount";
import {
  ApiError,
  deleteRecord,
  getRecord,
  listRecords,
  markVersionSent,
  updateRecord,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  type RecordDetail,
  type RecordStatus,
  type RecordSummary,
} from "@/lib/types";

/*
 * The Library.
 *
 * Selection lives in component state rather than the URL. That keeps the whole
 * screen one route with no navigation between rows — "open any record in
 * seconds" reads badly if opening one is a page load — and it sidesteps
 * `useSearchParams`, which would otherwise need a Suspense boundary here.
 */
function LibraryScreen() {
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [selected, setSelected] = useState<RecordDetail | null>(null);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; hint: string } | null>(
    null,
  );

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (q: string, statusFilter: string | null) => {
      try {
        const page = await listRecords({
          q: q || undefined,
          status: statusFilter ?? undefined,
        });
        setRecords(page.records);
        setError(null);
      } catch (caught) {
        const apiError = caught as ApiError;
        setError({ message: apiError.message, hint: apiError.hint ?? "" });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Searching on every keystroke would hammer the API; waiting for a submit
  // makes it feel dead. A short debounce is the honest middle.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(
      () => void refresh(query, status),
      query ? 220 : 0,
    );
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, status, refresh]);

  const open = useCallback(async (id: string) => {
    try {
      setSelected(await getRecord(id));
    } catch (caught) {
      const apiError = caught as ApiError;
      setError({ message: apiError.message, hint: apiError.hint ?? "" });
    }
  }, []);

  const patch = useCallback(
    async (id: string, changes: Parameters<typeof updateRecord>[1]) => {
      const updated = await updateRecord(id, changes);
      setSelected(updated);
      setRecords((current) =>
        current.map((row) => (row.id === id ? { ...row, ...updated } : row)),
      );
    },
    [],
  );

  /**
   * Say which of a record's CVs went to the employer.
   *
   * The card in the list carries the answer too — a "Sent: Tailored" chip and
   * the thumbnail of that document — so the row is rewritten from the reply
   * rather than left showing the old one until a reload.
   */
  const markSent = useCallback(async (id: string, versionId: string) => {
    const updated = await markVersionSent(id, versionId);
    setSelected(updated);
    const sent = updated.cv_versions.find((version) => version.sent);
    setRecords((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, sent_variant: sent?.variant ?? null, cv_count: updated.cv_count }
          : row,
      ),
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteRecord(id);
    setSelected(null);
    setRecords((current) => current.filter((row) => row.id !== id));
  }, []);

  const counts = useMemo(() => {
    const tally = new Map<string, number>();
    for (const record of records)
      tally.set(record.status, (tally.get(record.status) ?? 0) + 1);
    return tally;
  }, [records]);

  /* What the pile of applications says now lives in `LibraryPulse`, which
     counts it from these same records — no model call, no new endpoint. */

  return (
    <div className="min-h-dvh bg-mist">
      <TopBar recordCount={records.length} />

      {/* `max-w-ultra`, from the shared ladder, rather than the 100rem it used
          to pick for itself. A page that invents its own measure is a page that
          almost lines up with the bar above it — near enough to look like a
          mistake, far enough to be one. */}
      {/* The shape of the search, above both columns. It is about the whole
          pile, so it spans them rather than sitting inside the list. */}
      {!loading && !error && records.length >= 2 && (
        <div className="gutter-bar mx-auto max-w-ultra pt-3">
          <LibraryPulse records={records} />
        </div>
      )}

      <div className="gutter-bar mx-auto grid max-w-ultra grid-cols-1 gap-3 pb-3 pt-3 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl bg-raised shadow-float ring-1 ring-ink/5">
          <div className="hairline-b px-5 py-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company, role, notes, or the advert…"
              className="w-full rounded-pill bg-sunken px-4 py-2 text-sm text-ink placeholder:text-slate/55 focus:outline-none focus:ring-1 focus:ring-signal"
            />

            <div className="flex flex-wrap gap-1 pt-2.5">
              <FilterChip
                label="All"
                count={records.length}
                active={status === null}
                onClick={() => setStatus(null)}
              />
              {STATUS_ORDER.filter((s) => counts.get(s) || status === s).map(
                (s) => (
                  <FilterChip
                    key={s}
                    label={STATUS_LABEL[s]}
                    count={counts.get(s) ?? 0}
                    active={status === s}
                    onClick={() => setStatus(status === s ? null : s)}
                  />
                ),
              )}
            </div>
          </div>

          {loading ? (
            <p className="px-5 py-8 text-sm text-slate">
              Opening your Library…
            </p>
          ) : error ? (
            <div className="m-5 rounded-md bg-danger-soft px-4 py-3">
              <p className="font-display text-sm font-medium text-danger">
                {error.message}
              </p>
              {error.hint && (
                <p className="pt-1 text-2xs text-ink/70">{error.hint}</p>
              )}
            </div>
          ) : records.length === 0 ? (
            <Empty searching={Boolean(query || status)} />
          ) : (
            // Cards rather than rows, because the thing that tells two
            // applications apart is the CV on each, and a CV is a picture.
            <div className="grid gap-2 p-2.5">
              {records.map((record, index) => (
                <RecordCard
                  key={record.id}
                  record={record}
                  index={index}
                  selected={selected?.id === record.id}
                  onOpen={() => void open(record.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/*
          * One panel, shown on a phone only when it has something in it.
          *
          * It used to render unconditionally, and its empty state was a
          * `hidden lg:flex` prompt — so on every phone the page ended in a
          * stray rounded card with a ring and a shadow, under the list,
          * containing nothing. The prompt was correctly hidden; the box around
          * the prompt was not.
          *
          * Not two sections, one per breakpoint: that mounts the record twice,
          * gives the notes field two drafts, and lets the hidden one keep the
          * edit you made in the visible one.
          *
          * The sticky offset and the height cap are `lg:` because they describe
          * a side panel. On a phone there is no side — it is a block that
          * follows the list, and pinning it there would fix half a screen of
          * detail over the rows you are trying to scroll.
          */}
        <section
          className={cn(
            "min-w-0 overflow-hidden rounded-2xl bg-raised shadow-float ring-1 ring-ink/5",
            "lg:sticky lg:top-[calc(var(--spacing-bar)+0.75rem)] lg:block lg:h-[calc(100dvh-var(--spacing-bar)-1.5rem)]",
            selected ? "block" : "hidden",
          )}
        >
          <AnimatePresence mode="wait">
            {selected ? (
              <RecordPanel
                key={selected.id}
                record={selected}
                onStatusChange={(next: RecordStatus) =>
                  void patch(selected.id, { status: next })
                }
                onNotesChange={(notes) => void patch(selected.id, { notes })}
                onDelete={() => void remove(selected.id)}
                onClose={() => setSelected(null)}
                onMarkSent={(versionId) => void markSent(selected.id, versionId)}
              />
            ) : (
              <NothingSelected key="empty" />
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The Library's bar.
 *
 * It used to carry a sign-in form, a sign-out button, an email address and two
 * notices about anonymous work — a second, parallel account interface, with its
 * own copy of the session, that the nav knew nothing about. Signing out here
 * left the nav still showing an account, which is what made the button look
 * broken: it worked, and then half the screen carried on disagreeing with it.
 *
 * All of it is gone. The page is behind `RequireAccount` in both modes now, so
 * nobody reaches it signed out and there is no anonymous state left to explain,
 * and the account lives in one control that every screen shares.
 */
function TopBar({ recordCount }: { recordCount: number }) {
  return (
    <AppBar
      brandHref="/"
      context="Library"
      // The same measure the two columns below it use, so the wordmark sits
      // over the left edge of the list rather than near it.
      width="ultra"
      status={
        recordCount > 0 ? (
          <span
            className="shrink-0 whitespace-nowrap pr-1 text-2xs text-slate"
            data-numeric
          >
            {recordCount} {recordCount === 1 ? "application" : "applications"}
          </span>
        ) : null
      }
      // Outside the scrolling strip, which would clip its dropdown menu.
      account={<AccountButton />}
    >
      <BarLink href="/tailor">Tailor a CV</BarLink>
    </AppBar>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-1 font-display text-2xs transition-colors",
        // A pill grown to 44px for the thumb and left at its typed width is not
        // a pill any more — "All" becomes a 32×44 black egg. The floor is
        // vertical, so the answer is horizontal: enough padding that the radius
        // still reads as the ends of a pill rather than as a circle.
        "[@media(pointer:coarse)]:px-4",
        active
          ? "bg-ink text-paper"
          : "text-slate hover:bg-sunken hover:text-ink",
      )}
    >
      {label}
      {count > 0 && (
        <span
          className={cn("pl-1", active ? "text-panel-ink/60" : "text-slate/60")}
          data-numeric
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Empty({ searching }: { searching: boolean }) {
  if (searching) {
    return (
      <div className="grid place-items-center px-5 py-12 text-center">
        <NoMatchArt className="max-w-[9rem] opacity-70" />
        <p className="max-w-xs pt-4 text-sm leading-relaxed text-slate">
          Nothing matches that. Try a company, a role, or a phrase you remember
          from the advert.
        </p>
      </div>
    );
  }
  return (
    <div className="grid place-items-center px-5 py-10 text-center">
      <EmptyLibraryArt className="max-w-[16rem]" />
      <p className="pt-5 font-display text-lg font-semibold text-ink">
        Nothing filed yet.
      </p>
      <p className="max-w-sm pt-2 text-sm leading-relaxed text-slate">
        Tailor a CV and save it, and the job post is kept with it — so when a
        recruiter calls five weeks later, you still have what you applied
        against.
      </p>
      <Link
        href="/tailor"
        className="mt-5 inline-flex h-11 items-center rounded-pill bg-signal px-5 font-display text-sm font-medium text-paper shadow-cta transition-all hover:-translate-y-px hover:bg-signal-hover"
      >
        Tailor your first CV
      </Link>
    </div>
  );
}

function NothingSelected() {
  // No breakpoint of its own any more. The section around it is already hidden
  // wherever this prompt would be wrong, and two elements deciding the same
  // thing is how one of them ends up deciding it differently.
  return (
    <div className="flex h-full flex-col items-center justify-center p-10">
      <NothingSelectedArt className="max-w-[11rem] opacity-80" />
      <p className="max-w-xs pt-5 text-center text-sm leading-relaxed text-slate">
        Pick an application to see the CV you sent and the job post as it was on
        the day.
      </p>
    </div>
  );
}


/**
 * Everything here needs an account.
 *
 * The gate stands aside where Supabase is not configured, so a local checkout
 * with no auth still opens.
 */
export default function Page() {
  return (
    <RequireAccount>
      <LibraryScreen />
    </RequireAccount>
  );
}
