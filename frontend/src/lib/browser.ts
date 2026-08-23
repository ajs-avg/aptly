"use client";

import { useSyncExternalStore } from "react";

/**
 * Reading the browser's own state, without the effect-then-setState dance.
 *
 * A media query is an external store: something outside React that holds a
 * value and can tell you when it changes. Mirroring it into `useState` inside an
 * effect means the first render is always a guess, the correct value arrives one
 * render later, and every consumer flickers through the wrong state on the way.
 * `useSyncExternalStore` is the primitive built for exactly this, and it takes a
 * server snapshot too — so SSR gets a defined answer instead of a crash.
 */

const NOOP = () => () => {};

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/**
 * A value that only exists in a browser.
 *
 * Nothing to subscribe to — it never changes — but it still cannot be read
 * during SSR. This gives the server snapshot on the server and the real answer
 * on the client, in one render each, with no mismatch and no effect.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(NOOP, read, () => serverValue);
}
