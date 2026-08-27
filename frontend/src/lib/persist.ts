"use client";

/**
 * The working session, kept across a reload.
 *
 * A tailoring run costs about a minute of somebody's time and a real amount of
 * ours. Losing it to an accidental refresh, a phone rotating the tab out of
 * memory, or a laptop lid closing meant re-uploading the CV, re-pasting the
 * post, and paying for the whole analysis again — and everything they had
 * applied and edited by hand was simply gone.
 *
 * ── Why IndexedDB and not localStorage ──────────────────────────────────────
 *
 * The original file has to come with it. In-place export is the product's
 * central promise — "your formatting is never rebuilt from scratch" — and it
 * works by sending the person's own .docx back to the server at download time.
 * localStorage stores strings, so a file would have to be base64'd into one,
 * costing a third more space against a quota it could already exhaust, and
 * blocking the main thread on every save while it serialises. IndexedDB stores
 * a `File` as itself.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 *
 * It is not a record. Nothing here reaches a server, and saving an application
 * to the Library is still a thing the person does deliberately. This is the same
 * data that was already in the tab, surviving the tab being reloaded.
 *
 * It does not outlive the tab, either. A reload restores; closing Aptly and
 * coming back starts clean, because those are different intentions. See
 * `TAB_KEY`. Start over erases it immediately in any case.
 */

const DB_NAME = "aptly";
const DB_VERSION = 1;
const STORE = "session";
const KEY = "tailor";

/**
 * Bumped whenever the shape below changes in a way an older snapshot cannot
 * satisfy. A stale snapshot is discarded rather than migrated: it is at most a
 * few days of one draft, and the alternative is carrying a migration path for
 * every intermediate shape this has ever had.
 */
const SCHEMA = 1;

/**
 * How long a session survives at the outside.
 *
 * A backstop rather than the usual way one ends — see `TAB_KEY` below, which
 * ends nearly all of them much sooner. This only catches a record left behind
 * by a tab that was closed without the browser noticing.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What makes this survive a reload but not a closed tab.
 *
 * IndexedDB is per *origin*: what it holds outlives the tab that wrote it, so
 * the first version handed a week-old draft to somebody who had closed Aptly
 * and come back expecting a clean start. Reloading and reopening are different
 * intentions and were being answered identically.
 *
 * `sessionStorage` is per *tab* and is the only thing in the browser that draws
 * the line in the right place: it survives a reload, a navigation and a restore
 * from the back button, and is gone when the tab is. It cannot hold the CV
 * itself — it stores strings, and the original file has to come with the
 * session — so it holds a token instead, and the record in IndexedDB is only
 * restored to the tab that wrote it.
 */
const TAB_KEY = "aptly-tab";

export interface TailorSnapshot<TRun> {
  schema: number;
  savedAt: number;
  /** Which tab wrote this. See `TAB_KEY`. */
  tab: string;
  jobText: string;
  cvText: string;
  cvFile: File | null;
  run: TRun;
  pastReveal: boolean;
  verified: unknown;
}

/** This tab's token, if it has one. A tab that has never saved has none. */
function tabToken(): string | null {
  try {
    return sessionStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

function ensureTabToken(): string {
  const existing = tabToken();
  if (existing) return existing;
  const minted =
    globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2);
  try {
    sessionStorage.setItem(TAB_KEY, minted);
  } catch {
    // Private mode. The save below will simply never be restored, which is the
    // safe direction to fail in.
  }
  return minted;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

/**
 * Whether this browser will let us store anything at all.
 *
 * Private windows in some browsers expose `indexedDB` and then throw on open,
 * and a person browsing privately has said something about what they want kept.
 * Every call here is therefore allowed to fail quietly: persistence is a
 * convenience, and taking the screen down with it would be a poor trade.
 */
function available(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function saveSession<TRun>(
  snapshot: Omit<TailorSnapshot<TRun>, "schema" | "savedAt" | "tab">,
): Promise<void> {
  if (!available()) return;
  try {
    await run("readwrite", (store) =>
      store.put(
        { ...snapshot, schema: SCHEMA, savedAt: Date.now(), tab: ensureTabToken() },
        KEY,
      ),
    );
  } catch {
    // Out of quota, private mode, a corrupt profile. None of them are worth
    // interrupting somebody's editing for.
  }
}

export async function loadSession<TRun>(): Promise<TailorSnapshot<TRun> | null> {
  if (!available()) return null;
  try {
    const stored = await run<TailorSnapshot<TRun> | undefined>("readonly", (store) =>
      store.get(KEY),
    );
    if (!stored) return null;

    // Three ways a snapshot is not worth restoring, and all end the same way.
    // A shape this build cannot read would otherwise surface as a crash inside
    // a component, three renders from the cause.
    if (stored.schema !== SCHEMA) {
      await clearSession();
      return null;
    }
    if (Date.now() - stored.savedAt > MAX_AGE_MS) {
      await clearSession();
      return null;
    }
    // Written by a tab that is gone. Reloading and reopening are different
    // intentions, and this is the one that means "start again".
    const tab = tabToken();
    if (!tab || stored.tab !== tab) {
      await clearSession();
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  if (!available()) return;
  try {
    await run("readwrite", (store) => store.delete(KEY));
  } catch {
    // Nothing to do about it, and nothing depends on it having worked.
  }
}
