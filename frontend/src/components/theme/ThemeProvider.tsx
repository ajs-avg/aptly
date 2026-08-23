"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

/**
 * Light, dark, and — the default — whatever the device says.
 *
 * "System" is a real third state rather than a synonym for one of the other
 * two. Someone whose phone turns dark at sunset expects this page to turn with
 * it, and that only works if we store *the absence of a choice* and let CSS
 * answer the question every time it is asked.
 *
 * So the DOM carries `data-theme` only when the person has actually chosen.
 * Left off, `prefers-color-scheme` in globals.css decides, live.
 *
 * The choice itself lives in the DOM attribute and in localStorage — not in
 * React state — and is read through `useSyncExternalStore`. That is not a
 * refactor for its own sake: the pre-paint script below sets the attribute
 * before React exists, so React holding its own copy would mean two sources of
 * truth that disagree for exactly as long as it takes the first effect to run.
 */

export type ThemeChoice = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

const STORAGE_KEY = "aptly-theme";
const DARK = "(prefers-color-scheme: dark)";

interface ThemeState {
  /** What the person picked. "system" until they pick something. */
  choice: ThemeChoice;
  /** What that currently resolves to. */
  resolved: Resolved;
  set: (choice: ThemeChoice) => void;
  /** Light ⇄ dark from wherever it is now. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/**
 * Runs before first paint, inlined in <head>.
 *
 * Without this the page renders light, then React mounts and switches it — a
 * white flash on every navigation for anyone using dark mode. It has to be a
 * blocking script in the document head; there is no React lifecycle early
 * enough to prevent that paint.
 *
 * Deliberately tiny and dependency-free, and it fails silently: a browser with
 * storage blocked still gets the system theme, which is the correct default
 * anyway.
 */
export const themeScript = `(function(){try{var c=localStorage.getItem("${STORAGE_KEY}");if(c==="light"||c==="dark"){document.documentElement.setAttribute("data-theme",c)}}catch(e){}})();`;

/* ── The store: the DOM attribute, plus the OS setting ─────────────────────── */

const listeners = new Set<() => void>();

function announce() {
  for (const listener of listeners) listener();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);

  // The OS flipping at sunset, and this page changed in another tab.
  const media = window.matchMedia(DARK);
  media.addEventListener("change", notify);
  window.addEventListener("storage", notify);

  return () => {
    listeners.delete(notify);
    media.removeEventListener("change", notify);
    window.removeEventListener("storage", notify);
  };
}

function readChoice(): ThemeChoice {
  const attribute = document.documentElement.getAttribute("data-theme");
  return attribute === "light" || attribute === "dark" ? attribute : "system";
}

/**
 * One string carrying both halves — "system:dark", "light", "dark".
 *
 * `useSyncExternalStore` compares snapshots by identity, so this has to be a
 * primitive. Returning an object would allocate a new one on every read and
 * re-render forever.
 */
function snapshot(): string {
  const choice = readChoice();
  if (choice !== "system") return choice;
  return window.matchMedia(DARK).matches ? "system:dark" : "system:light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const current = useSyncExternalStore(subscribe, snapshot, () => "system:light");

  const set = useCallback((next: ThemeChoice) => {
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);

    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The theme still applies for this session; it just will not persist.
    }

    // The attribute is the store, and mutating it fires no event of its own.
    announce();
  }, []);

  const value = useMemo<ThemeState>(() => {
    const choice: ThemeChoice = current.startsWith("system") ? "system" : (current as Resolved);
    const resolved: Resolved = current.endsWith("dark") ? "dark" : "light";
    return {
      choice,
      resolved,
      set,
      toggle: () => set(resolved === "dark" ? "light" : "dark"),
    };
  }, [current, set]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const found = useContext(ThemeContext);
  if (!found) throw new Error("useTheme must be used inside <ThemeProvider>.");
  return found;
}
