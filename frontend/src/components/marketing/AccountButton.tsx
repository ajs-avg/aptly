"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

import { EASE_QUICK } from "@/components/motion/primitives";
import { useAccount, signOutAccount } from "@/lib/account";
import { cn } from "@/lib/utils";

/**
 * The one control that says whether you are signed in.
 *
 * It replaced three that disagreed. The marketing nav offered "Sign in" whether
 * or not you were; the Library carried its own "Sign out" beside its own copy
 * of the session; and nothing told the other when either changed. Somebody who
 * signed in was still invited to sign in, and somebody who signed out was still
 * shown their address.
 *
 * One vocabulary, too. "Sign in" and "Sign out" throughout — not "log in" in
 * one place and "sign in" in another, which reads as two different doors into
 * two different products. The pair chosen is the one the rest of the copy
 * already used.
 *
 * Signed out it is a link. Signed in it is a menu, because there is more than
 * one thing to do with an account and a bare "Sign out" is the least useful of
 * them to put in front of somebody who has just arrived.
 */
export function AccountButton({ className }: { className?: string }) {
  const account = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!shell.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  /*
   * Nothing at all until the answer is known.
   *
   * "Unknown" is a real third state, and rendering it as signed out means
   * everybody sees "Sign in" flash for the moment it takes to read a token or
   * ask the API — including the people who are signed in, for whom it is simply
   * wrong. A gap that fills in is better than a wrong answer that corrects
   * itself, so the space is held at the right width and stays empty.
   */
  if (account.status === "unknown") {
    return <span aria-hidden className={cn("inline-block w-[4.5rem]", className)} />;
  }

  if (account.status === "out") {
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(pathname)}`}
        className={cn(
          "inline-flex shrink-0 items-center whitespace-nowrap rounded-pill px-2.5 py-2 font-display text-xs text-slate transition-colors hover:bg-sunken hover:text-ink",
          className,
        )}
      >
        Sign in
      </Link>
    );
  }

  const initial = (account.name ?? account.email ?? "?").charAt(0).toUpperCase();

  return (
    <div ref={shell} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account: ${account.email ?? "signed in"}`}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-pill py-1 pl-1 pr-2.5 font-display text-xs text-ink transition-colors hover:bg-sunken"
      >
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-signal-soft font-display text-2xs font-semibold text-signal"
        >
          {initial}
        </span>
        {/* The name is the greeting; below `sm` the avatar carries it alone.
            This was gated at `xs`, which put up to 7rem of name on a 390px
            phone — the width the marketing pill does not have: with the name
            showing, the row ran 8px past the edge and the whole page panned. */}
        <span className="hidden max-w-[7rem] truncate sm:inline">
          {account.name ?? "Account"}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={menuId}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={EASE_QUICK}
            // Fixed and edge-to-edge on a phone: anchored to the button's
            // right edge, a 240px panel starts 82px off the left of a 320px
            // screen — the avatar sits mid-bar, not at the bar's end. From
            // `sm` there is room to hang it off the button as usual.
            className="fixed inset-x-3 top-[4.75rem] z-50 overflow-hidden rounded-2xl bg-raised p-1.5 shadow-card ring-1 ring-ink/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-60"
          >
            <div className="px-2.5 py-2">
              <p className="truncate font-display text-sm font-medium text-ink">
                {account.name ?? "Signed in"}
              </p>
              <p className="truncate pt-0.5 text-2xs text-slate">{account.email}</p>
              {account.development && (
                <p className="pt-1.5 text-2xs leading-relaxed text-amber-ink">
                  No password on this deployment.
                </p>
              )}
            </div>

            <div className="my-1 h-px bg-hairline" />

            {/* First, and named for what it holds rather than for what it is.
                It is the one screen here that makes every future tailoring
                better, and nobody opens "Settings" expecting that. */}
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center rounded-xl px-2.5 py-2 font-display text-sm text-ink transition-colors hover:bg-sunken"
            >
              Your profile
            </Link>
            <Link
              href="/library"
              onClick={() => setOpen(false)}
              className="flex items-center rounded-xl px-2.5 py-2 font-display text-sm text-ink transition-colors hover:bg-sunken"
            >
              Your Library
            </Link>
            <Link
              href="/tailor"
              onClick={() => setOpen(false)}
              className="flex items-center rounded-xl px-2.5 py-2 font-display text-sm text-ink transition-colors hover:bg-sunken"
            >
              Tailor a CV
            </Link>

            <div className="my-1 h-px bg-hairline" />

            <button
              type="button"
              disabled={leaving}
              onClick={async () => {
                setLeaving(true);
                await signOutAccount();
                setOpen(false);
                setLeaving(false);
                // Home, not wherever they were. Half the app needs an account,
                // and leaving somebody on the Library they can no longer read
                // is how a sign-out looks like it failed.
                router.push("/");
              }}
              className="flex w-full items-center rounded-xl px-2.5 py-2 text-left font-display text-sm text-danger transition-colors hover:bg-danger-soft disabled:opacity-50"
            >
              {leaving ? "Signing out…" : "Sign out"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
