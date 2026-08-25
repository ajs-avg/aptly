"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { authConfigured, client, currentSession } from "@/lib/supabase";

/**
 * The app, behind an account.
 *
 * A deliberate reversal. The product was built anonymous-first — a stranger
 * could tailor a CV end to end and only be asked for an account when they
 * wanted to *keep* it — and that is still the better funnel. This gate is a
 * product decision to require one up front instead.
 *
 * Two things it must not do:
 *
 * **Lock out a deployment with no auth.** Where Supabase is not configured
 * there is nothing to sign in to, so the gate stands aside entirely. Otherwise
 * every local checkout becomes an unopenable door.
 *
 * **Flash the page before redirecting.** Somebody signed out would otherwise
 * see the CV they cannot use for a frame, which reads as the app breaking. The
 * children render only once the session is known to exist.
 */
export function RequireAccount({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // `undefined` while unknown, deliberately distinct from `false`. The two mean
  // "still asking" and "definitely signed out", and only the second should
  // redirect — treating them the same bounces a signed-in person to the
  // sign-in page on every reload.
  const [allowed, setAllowed] = useState<boolean | undefined>(
    authConfigured ? undefined : true,
  );

  useEffect(() => {
    if (!authConfigured) return;

    let live = true;

    void currentSession().then((session) => {
      if (!live) return;
      if (session) {
        setAllowed(true);
        return;
      }
      setAllowed(false);
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    });

    // Signing out in another tab, or a refresh token that finally expires,
    // should close this tab's door too rather than leaving a dead session
    // whose every API call quietly returns nothing.
    //
    // But only on `SIGNED_OUT`, and that distinction is the difference between
    // staying signed in and not. Supabase emits several events with a null
    // session that do not mean the person has been signed out — a token refresh
    // that failed because the tab was offline for a moment, or was asleep, is
    // the common one, and treating it as a sign-out threw somebody out of a CV
    // they were editing and made them log in again. A failed refresh is
    // retried; an expired refresh token arrives here as `SIGNED_OUT`.
    const subscription = client()?.auth.onAuthStateChange((event, session) => {
      if (!live) return;
      if (session) {
        setAllowed(true);
        return;
      }
      if (event !== "SIGNED_OUT") return;
      setAllowed(false);
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    });

    // A tab that has been in the background for hours comes back with an access
    // token that expired while nothing was running. Asking for the session on
    // return refreshes it before the first API call is made with a dead one —
    // otherwise the Library loads empty and reads as having been signed out.
    const onVisible = () => {
      if (document.visibilityState === "visible") void currentSession();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      subscription?.data.subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (!allowed) return <Waiting />;
  return <>{children}</>;
}

/**
 * The moment before the answer arrives.
 *
 * Nothing but the page's own ground. A spinner here would flash for the ~50ms
 * it usually takes to read a token out of local storage, which is more
 * distracting than an empty page and says nothing useful.
 */
function Waiting() {
  return <div className="min-h-dvh bg-mist" aria-busy="true" />;
}
