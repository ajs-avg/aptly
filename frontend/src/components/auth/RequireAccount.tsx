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
    const subscription = client()?.auth.onAuthStateChange((_event, session) => {
      if (!live) return;
      if (session) {
        setAllowed(true);
      } else {
        setAllowed(false);
        router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
      }
    });

    return () => {
      live = false;
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
