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
 * But it *does* now outlive the tab being closed, which the in-memory version
 * did not — so it expires on its own, and Start over erases it immediately.
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
 * How long a session survives.
 *
 * Seven days, matching what the Library already promises an anonymous visitor
 * about work saved to this browser. Long enough to come back to an application
 * on Monday; short enough that a CV is not sitting in a shared machine's
 * profile a month later.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface TailorSnapshot<TRun> {
  schema: number;
  savedAt: number;
  jobText: string;
  cvText: string;
  cvFile: File | null;
  run: TRun;
  pastReveal: boolean;
  verified: unknown;
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
  snapshot: Omit<TailorSnapshot<TRun>, "schema" | "savedAt">,
): Promise<void> {
  if (!available()) return;
  try {
    await run("readwrite", (store) =>
      store.put({ ...snapshot, schema: SCHEMA, savedAt: Date.now() }, KEY),
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

    // Two ways a snapshot is not worth restoring, and both end the same way.
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
