"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { CallFinder } from "@/components/library/CallFinder";
import { LibraryPulse } from "@/components/library/LibraryPulse";
import { MergeBanner } from "@/components/library/MergeBanner";
import { RecordStage } from "@/components/library/RecordStage";
import { ShelfCard } from "@/components/library/ShelfCard";
import { NoMatchArt } from "@/components/visual/illustrations";
import { AccountButton } from "@/components/marketing/AccountButton";
import { AppBar, BarLink } from "@/components/app/AppBar";
import { RequireAccount } from "@/components/auth/RequireAccount";
import { EASE } from "@/components/motion/primitives";
import {
  ApiError,
  deleteRecord,
  getRecord,
  listDuplicates,
  listRecords,
  mergeRecords,
  markVersionSent,
  updateRecord,
} from "@/lib/api";
import { DEMO_RECORDS } from "@/lib/demo";
import { useStage } from "@/components/stage/store";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  type DuplicateGroup,
  type RecordDetail,
  type RecordStatus,
  type RecordSummary,
} from "@/lib/types";

/*
 * The Library: a shelf of the CVs that went out.
 *
 * Each application is the document itself, small enough to see many and large
 * enough to read the first lines of. Opening one takes it off the shelf and
 * lays it on the desk — full size, with the job post beside it — rather than
 * opening a panel next to a list.
 *
 * Selection lives in component state rather than the URL. That keeps the whole
 * screen one route with no navigation between records, and it sidesteps
 * `useSearchParams`, which would otherwise need a Suspense boundary here.
 */
function LibraryScreen() {
  // Camera back, the filed CVs in depth behind the shelf.
  useStage("library");

  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [selected, setSelected] = useState<RecordDetail | null>(null);
  /** Whether the opened record should come up in call mode. */
  const [callOnOpen, setCallOnOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; hint: string } | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (q: string, statusFilter: string | null) => {
    try {
      const page = await listRecords({ q: q || undefined, status: statusFilter ?? undefined });
      setRecords(page.records);
      setError(null);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError({ message: apiError.message, hint: apiError.hint ?? "" });
    } finally {
      setLoading(false);
    }
  }, []);

  // Searching on every keystroke would hammer the API; waiting for a submit
  // makes it feel dead. A short debounce is the honest middle.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void refresh(query, status), query ? 220 : 0);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, status, refresh]);

  const open = useCallback(async (id: string, call = false) => {
    try {
      const record = await getRecord(id);
      setCallOnOpen(call);
      setSelected(record);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) {
      const apiError = caught as ApiError;
      setError({ message: apiError.message, hint: apiError.hint ?? "" });
    }
  }, []);

  const patch = useCallback(async (id: string, changes: Parameters<typeof updateRecord>[1]) => {
    const updated = await updateRecord(id, changes);
    setSelected(updated);
    setRecords((current) => current.map((row) => (row.id === id ? { ...row, ...updated } : row)));
  }, []);

  /** Say which of a record's CVs went to the employer; the shelf card follows. */
  const markSent = useCallback(async (id: string, versionId: string) => {
    const updated = await markVersionSent(id, versionId);
    setSelected(updated);
    const sent = updated.cv_versions.find((version) => version.sent);
    setRecords((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, sent_variant: sent?.variant ?? null, cv_count: updated.cv_count, cv_shape: updated.cv_shape ?? row.cv_shape }
          : row,
      ),
    );
  }, []);

  /* Rows already filed as two for one job: looked for once a visit. */
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [merging, setMerging] = useState(false);
  const checkedDuplicates = useRef(false);

  useEffect(() => {
    if (checkedDuplicates.current || loading || error || records.length < 2) return;
    checkedDuplicates.current = true;
    void listDuplicates()
      .then(setDuplicates)
      .catch(() => {
        // A tidy-up prompt that cannot load is not worth an error on screen.
      });
  }, [loading, error, records.length]);

  const merge = useCallback(
    async (group: DuplicateGroup) => {
      setMerging(true);
      try {
        await mergeRecords(group.records.map((record) => record.id));
        setDuplicates((current) => current.filter((item) => item !== group));
        setSelected(null);
        await refresh(query, status);
      } catch (caught) {
        const apiError = caught as ApiError;
        setError({ message: apiError.message, hint: apiError.hint ?? "" });
      } finally {
        setMerging(false);
      }
    },
    [refresh, query, status],
  );

  const remove = useCallback(async (id: string) => {
    await deleteRecord(id);
    setSelected(null);
    setRecords((current) => current.filter((row) => row.id !== id));
  }, []);

  const counts = useMemo(() => {
    const tally = new Map<string, number>();
    for (const record of records) tally.set(record.status, (tally.get(record.status) ?? 0) + 1);
    return tally;
  }, [records]);

  const searching = Boolean(query || status);

  return (
    <div className="relative min-h-dvh">
      <AppBar
        brandHref="/"
        context="Library"
        width="ultra"
        status={
          records.length > 0 ? (
            <span className="shrink-0 whitespace-nowrap pr-1 text-2xs text-slate" data-numeric>
              {records.length} {records.length === 1 ? "application" : "applications"}
            </span>
          ) : null
        }
        account={<AccountButton />}
      >
        <BarLink href="/tailor">Tailor a CV</BarLink>
      </AppBar>

      <main className="gutter-bar mx-auto max-w-ultra pb-20 pt-5">
        <AnimatePresence mode="wait" initial={false}>
          {selected ? (
            <RecordStage
              key={selected.id}
              record={selected}
              onStatusChange={(next: RecordStatus) => void patch(selected.id, { status: next })}
              onNotesChange={(notes) => void patch(selected.id, { notes })}
              onDelete={() => void remove(selected.id)}
              onClose={() => setSelected(null)}
              onMarkSent={(versionId) => void markSent(selected.id, versionId)}
              initialCallMode={callOnOpen}
            />
          ) : (
            <motion.div
              key="shelf"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={EASE}
            >
              {/* The phone is ringing: the first thing on the shelf. */}
              {!loading && !error && records.length > 0 && (
                <CallFinder onOpen={(id, call) => void open(id, call)} className="mb-6" />
              )}

              {/* The toolbar: one line, the search and the filters. */}
              <div className="flex flex-wrap items-center gap-2 pb-6">
                <div className="relative w-full sm:w-80">
                  <svg
                    viewBox="0 0 24 24"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path strokeLinecap="round" d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search company, role, notes, or the advert…"
                    className="h-9 w-full rounded-pill bg-raised pl-9 pr-4 text-sm text-ink ring-1 ring-hairline placeholder:text-slate/55 focus:outline-none focus:ring-signal"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  <FilterChip label="All" count={records.length} active={status === null} onClick={() => setStatus(null)} />
                  {STATUS_ORDER.filter((s) => counts.get(s) || status === s).map((s) => (
                    <FilterChip
                      key={s}
                      label={STATUS_LABEL[s]}
                      count={counts.get(s) ?? 0}
                      active={status === s}
                      onClick={() => setStatus(status === s ? null : s)}
                    />
                  ))}
                </div>
                <Link
                  href="/tailor"
                  className="ml-auto hidden h-9 items-center rounded-pill bg-ink px-4 font-display text-xs font-medium text-paper transition-opacity hover:opacity-90 sm:inline-flex"
                >
                  Tailor a CV
                </Link>
              </div>

              {!loading && !error && records.length >= 2 && (
                <div className="grid gap-3 pb-6">
                  <AnimatePresence>
                    {duplicates.length > 0 && (
                      <MergeBanner
                        key="merge"
                        groups={duplicates}
                        busy={merging}
                        onMerge={(group) => void merge(group)}
                        onDismiss={() => setDuplicates([])}
                      />
                    )}
                  </AnimatePresence>
                  <LibraryPulse records={records} />
                </div>
              )}

              {loading ? (
                <Shelf>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="aspect-[1/1.3] rounded-xl bg-raised ring-1 ring-hairline" />
                      <div className="mt-3.5 h-3 w-2/3 rounded bg-raised" />
                      <div className="mt-2 h-2.5 w-1/2 rounded bg-raised" />
                    </div>
                  ))}
                </Shelf>
              ) : error ? (
                <div className="max-w-md rounded-xl bg-danger-soft px-4 py-3">
                  <p className="font-display text-sm font-medium text-danger">{error.message}</p>
                  {error.hint && <p className="pt-1 text-2xs text-ink/70">{error.hint}</p>}
                </div>
              ) : records.length === 0 ? (
                searching ? (
                  <div className="grid place-items-center px-5 py-16 text-center">
                    <NoMatchArt className="max-w-[9rem] opacity-70" />
                    <p className="max-w-xs pt-4 text-sm leading-relaxed text-slate">
                      Nothing matches that. Try a company, a role, or a phrase you remember from
                      the advert.
                    </p>
                  </div>
                ) : (
                  <GhostShelf />
                )
              ) : (
                <Shelf>
                  {records.map((record, index) => (
                    <ShelfCard
                      key={record.id}
                      record={record}
                      index={index}
                      onOpen={() => void open(record.id)}
                    />
                  ))}
                </Shelf>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

function Shelf({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {children}
    </div>
  );
}

/**
 * The shelf with nothing on it: three applications that do not exist, faded.
 *
 * A picture of the full shelf says what the empty one is for better than a
 * sentence about it, and the one real thing on the screen is the button.
 */
function GhostShelf() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
      <div className="pt-2">
        <p className="font-display text-2xs font-medium uppercase tracking-[0.12em] text-signal">
          Your Library
        </p>
        <h2 className="pt-3 font-display text-3xl font-medium tracking-[-0.022em] text-ink">
          Nothing filed yet.
        </h2>
        <p className="pt-3 text-sm leading-relaxed text-slate">
          Tailor a CV and save it, and the job post is kept with it — so when a recruiter calls
          five weeks later, you still have exactly what you applied with.
        </p>
        <Link
          href="/tailor"
          className="mt-6 inline-flex h-10 items-center rounded-pill bg-ink px-5 font-display text-sm font-medium text-paper shadow-cta transition-all hover:-translate-y-px hover:opacity-90"
        >
          Tailor your first CV
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3">
        {DEMO_RECORDS.map((record, index) => (
          <ShelfCard key={record.id} record={record} index={index} ghost />
        ))}
      </div>
    </div>
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
        "inline-flex h-9 items-center rounded-pill px-3 font-display text-xs transition-colors [@media(pointer:coarse)]:px-4",
        active ? "bg-ink text-paper" : "text-slate hover:bg-white/[0.06] hover:text-ink",
      )}
    >
      {label}
      {count > 0 && (
        <span className={cn("pl-1.5", active ? "text-paper/60" : "text-slate/60")} data-numeric>
          {count}
        </span>
      )}
    </button>
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
