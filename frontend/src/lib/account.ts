"use client";

import { useSyncExternalStore } from "react";

import { getSession, signOut as endApiSession } from "./api";
import {
  authConfigured,
  client,
  currentSession,
  signOutEverywhere,
} from "./supabase";

/**
 * Who is signed in, as one answer the whole app shares.
 *
 * Nothing owned this before, and the cost was visible on every screen. The nav
 * had no idea, so it offered "Sign in" to somebody who already was. The Library
 * asked the API separately and kept its own copy, so signing out there left the
 * nav still showing an account. Two components asking the same question and
 * disagreeing about the answer is not a rendering bug, it is the absence of a
 * place for the answer to live.
 *
 * ── Two providers, one answer ──────────────────────────────────────────────
 *
 * Which one is in force is a deployment decision (see `authConfigured`), and no
 * caller should have to know:
 *
 * - **Supabase.** The session is a JWT in local storage, and the library tells
 *   us when it changes.
 * - **The development sign-in.** The session is an httpOnly cookie, which
 *   JavaScript cannot read by design — so the only way to know is to ask the
 *   API, and the only way to know it has *changed* is to ask again.
 *
 * Held in a module rather than in a context so that a component as small as a
 * nav button can read it without the whole tree being wrapped, and so that one
 * fetch answers every subscriber instead of one per mounted component.
 */

export type AccountStatus = "unknown" | "in" | "out";

export interface Account {
  status: AccountStatus;
  email: string | null;
  /**
   * What to call them.
   *
   * Their own answer where there is one — sign-up asks for it — and otherwise
   * derived from the address: the part before the `@`, tidied, so
   * "aman.mishra@x.com" becomes "Aman". A greeting, not an identity; the full
   * address is shown wherever the difference could matter.
   */
  name: string | null;
  /** True where Aptly's own password sign-in is in use rather than Supabase. */
  development: boolean;
  /** True where "forgot password" can set a new one without an emailed link. */
  directReset: boolean;
}

const SIGNED_OUT: Account = {
  status: "out",
  email: null,
  name: null,
  development: false,
  directReset: false,
};

let current: Account = { ...SIGNED_OUT, status: "unknown" };
const listeners = new Set<() => void>();
/** In flight, so ten components mounting at once make one request. */
let pending: Promise<Account> | null = null;

function publish(next: Account): Account {
  // Compared field by field: `useSyncExternalStore` re-renders on identity, and
  // a fresh object every poll would re-render every subscriber for an answer
  // that has not changed.
  if (
    next.status === current.status &&
    next.email === current.email &&
    next.name === current.name &&
    next.development === current.development &&
    next.directReset === current.directReset
  ) {
    return current;
  }
  current = next;
  for (const listener of listeners) listener();
  return current;
}

function firstName(email: string | null): string | null {
  if (!email) return null;
  const local = email.split("@")[0] ?? "";
  const word = local.split(/[.\-_+]/)[0] ?? local;
  if (!word) return null;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Ask whichever provider is in force, and tell every subscriber. */
export function refreshAccount(): Promise<Account> {
  pending ??= (async (): Promise<Account> => {
    try {
      if (authConfigured) {
        const session = await currentSession();
        const email = session?.user?.email ?? null;
        return publish(
          session
            ? {
                status: "in",
                email,
                name: (session.user?.user_metadata?.name as string) || firstName(email),
                development: false,
                directReset: false,
              }
            : SIGNED_OUT,
        );
      }

      const session = await getSession();
      return publish(
        session.signed_in
          ? {
              status: "in",
              email: session.email,
              // Their own answer first; the address is only the fallback for a
              // profile made before sign-up asked for a name.
              name: session.name || firstName(session.email),
              development: session.development_mode,
              directReset: session.direct_reset,
            }
          : {
              ...SIGNED_OUT,
              development: session.development_mode,
              directReset: session.direct_reset,
            },
      );
    } catch {
      // The API being unreachable is not evidence of being signed out, and
      // treating it as such would sign somebody out of the interface while
      // their session is perfectly alive. The last known answer stands.
      return current;
    } finally {
      pending = null;
    }
  })();
  return pending;
}

/**
 * End the session, both halves of it.
 *
 * Supabase holds a token in local storage and the API holds a cookie; clearing
 * one and not the other leaves somebody signed in to half the product, which
 * reads as a broken button rather than as a sign-out. The API call runs in both
 * modes because the anonymous cookie is ours either way.
 */
export async function signOutAccount(): Promise<void> {
  try {
    if (authConfigured) await signOutEverywhere();
  } finally {
    try {
      await endApiSession();
    } catch {
      // Already gone, or unreachable. The local state below is what the person
      // sees, and it is not worth stranding them on a page that still says they
      // are signed in because a network call failed.
    }
    publish({
      ...SIGNED_OUT,
      development: current.development,
      directReset: current.directReset,
    });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // First subscriber asks. Later ones ride on the answer.
  if (current.status === "unknown") void refreshAccount();

  const unsubscribe = () => {
    listeners.delete(listener);
  };

  if (!authConfigured) return unsubscribe;

  // Supabase tells us; the development sign-in cannot, because its session is
  // an httpOnly cookie. There, the answer changes only when this tab changes
  // it, and the two places that do call `refreshAccount` themselves.
  const watcher = client()?.auth.onAuthStateChange(() => void refreshAccount());
  return () => {
    unsubscribe();
    watcher?.data.subscription.unsubscribe();
  };
}

const serverSnapshot: Account = { ...SIGNED_OUT, status: "unknown" };

export function useAccount(): Account {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => serverSnapshot,
  );
}
