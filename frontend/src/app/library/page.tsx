"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";

import { RecordPanel } from "@/components/library/RecordPanel";
import { RecordRow } from "@/components/library/RecordRow";
import { AppBar, BarLink } from "@/components/app/AppBar";
import { RequireAccount } from "@/components/auth/RequireAccount";
import { authConfigured, signOutEverywhere } from "@/lib/supabase";
import {
  ApiError,
  deleteRecord,
  getRecord,
  getSession,
  listRecords,
  signIn,
  signOut,
  updateRecord,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  type AuthSession,
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
  const [session, setSession] = useState<AuthSession | null>(null);
  const [anonymous, setAnonymous] = useState(true);

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
        setAnonymous(page.anonymous);
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

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => {});
  }, []);

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

  return (
    <div className="min-h-dvh bg-mist">
      <TopBar
        session={session}
        anonymous={anonymous}
        recordCount={records.length}
        onSignedIn={(next) => {
          setSession(next);
          void refresh(query, status);
        }}
        onSignedOut={(next) => {
          setSession(next);
          setSelected(null);
          void refresh("", null);
        }}
      />

      <div className="mx-auto grid max-w-[100rem] grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
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
            <div>
              {records.map((record, index) => (
                <RecordRow
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

        <section className="min-w-0 overflow-hidden rounded-2xl bg-raised shadow-float ring-1 ring-ink/5 lg:sticky lg:top-[4.5rem] lg:h-[calc(100dvh-5.25rem)]">
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

function TopBar({
  session,
  anonymous,
  recordCount,
  onSignedIn,
  onSignedOut,
}: {
  session: AuthSession | null;
  anonymous: boolean;
  recordCount: number;
  onSignedIn: (session: AuthSession) => void;
  onSignedOut: (session: AuthSession) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState<number | null>(null);

  const submit = async () => {
    if (!email.includes("@")) return;
    setBusy(true);
    try {
      const next = await signIn(email);
      setClaimed(next.claimed);
      onSignedIn(next);
    } catch {
      // The inline hint below is enough; a failed dev sign-in is not an event.
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AppBar
        brandHref="/"
        context="Library"
        status={
          recordCount > 0 ? (
            <span className="pr-1 text-2xs text-slate" data-numeric>
              {recordCount} {recordCount === 1 ? "application" : "applications"}
            </span>
          ) : null
        }
      >
        <BarLink href="/tailor">Tailor a CV</BarLink>

        {session?.signed_in ? (
          <>
            <span className="hidden px-1 text-2xs text-slate sm:inline">{session.email}</span>
            <button
              type="button"
              onClick={async () => {
                // Both, in this order. Supabase holds the token in local
                // storage and the API holds the session cookie; clearing one
                // and not the other leaves somebody signed in to half the
                // product, which reads as a bug rather than as a sign-out.
                if (authConfigured) await signOutEverywhere();
                onSignedOut(await signOut());
              }}
              className="inline-flex h-8 items-center rounded-pill px-3 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink"
            >
              Sign out
            </button>
          </>
        ) : authConfigured ? (
          // Real accounts: the sign-in page owns this, because a password field
          // belongs on a page rather than in a toolbar.
          <BarLink href="/sign-in?next=/library">Keep these</BarLink>
        ) : (
          // No Supabase on this deployment — the development sign-in, which is
          // email-only with no password and refuses to run in production.
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="h-8 w-40 rounded-pill bg-sunken px-3 text-2xs text-ink placeholder:text-slate/55 focus:outline-none focus:ring-1 focus:ring-signal"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-8 items-center rounded-pill bg-ink px-3.5 font-display text-xs font-medium text-paper transition-colors hover:bg-ink-soft disabled:opacity-50"
            >
              {busy ? "…" : "Keep these"}
            </button>
          </form>
        )}
      </AppBar>

      {/* Two notices that only ever appear one at a time, sitting under the bar
          rather than inside it — the bar has to stay a fixed height as state
          changes, or the whole page jumps when you sign in. */}
      {claimed !== null && claimed > 0 && (
        <p className="mx-3 mt-2 rounded-pill bg-signal-soft px-4 py-1.5 text-center text-2xs text-signal">
          {claimed} {claimed === 1 ? "item" : "items"} you saved before signing
          in came with you.
        </p>
      )}

      {anonymous && recordCount > 0 && !session?.signed_in && (
        <p className="mx-3 mt-2 rounded-pill bg-amber-soft px-4 py-1.5 text-center text-2xs text-amber-ink">
          These are saved to this browser for 7 days. Add an email to keep them.
        </p>
      )}
    </>
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
        "rounded-pill px-2.5 py-1 font-display text-2xs transition-colors",
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
      <p className="px-5 py-10 text-sm text-slate">
        Nothing matches that. Try a company, a role, or a phrase you remember
        from the advert.
      </p>
    );
  }
  return (
    <div className="px-5 py-10">
      <p className="font-display text-base text-ink">No applications yet.</p>
      <p className="max-w-sm pt-1.5 text-sm leading-relaxed text-slate">
        Tailor a CV and save it, and the job post is kept with it — so when a
        recruiter calls five weeks later, you still have what you applied
        against.
      </p>
      <Link
        href="/tailor"
        className="mt-4 inline-flex h-9 items-center rounded-pill bg-signal px-4 font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
      >
        Tailor a CV
      </Link>
    </div>
  );
}

function NothingSelected() {
  return (
    <div className="hidden h-full items-center justify-center p-10 lg:flex">
      <p className="max-w-xs text-center text-sm leading-relaxed text-slate">
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
