"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAccount } from "@/lib/account";

/**
 * The app, behind an account.
 *
 * A deliberate reversal. The product was built anonymous-first — a stranger
 * could tailor a CV end to end and only be asked for an account when they
 * wanted to *keep* it — and that is still the better funnel. This gate is a
 * product decision to require one up front instead.
 *
 * It used to stand aside entirely wherever Supabase was not configured, on the
 * grounds that there was nothing to sign in to. That was true of Supabase and
 * false of the deployment: the development sign-in is a real session with a
 * real profile behind it, so the gate simply was not running anywhere it was
 * actually deployed. Pressing "Tailor a CV" signed out opened the CV screen,
 * and the work went to an anonymous session that the next sign-in would have to
 * claim.
 *
 * Both modes now go through `useAccount`, which is also what the nav reads — so
 * the gate and the button that leads to it can no longer disagree about whether
 * somebody is signed in.
 *
 * Two things it must not do:
 *
 * **Redirect on a maybe.** "Unknown" is a third state, distinct from "signed
 * out", and only the second should send anybody anywhere. Treating them the
 * same bounces a signed-in person to the sign-in page on every reload, for the
 * moment it takes to read a token.
 *
 * **Flash the page before redirecting.** Somebody signed out would otherwise
 * see the CV screen for a frame, which reads as the app breaking.
 */
export function RequireAccount({
  children,
  soft = false,
}: {
  children: React.ReactNode;
  /**
   * Let the signed-out through instead of redirecting them.
   *
   * The funnel case: a stranger should be able to drop a CV and see the
   * score — that moment is the argument for the account — and the page
   * itself decides what to hold back until they have one. `useAccount`
   * inside the page is how it knows which visitor it has.
   */
  soft?: boolean;
}) {
  const account = useAccount();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (soft || account.status !== "out") return;
    router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [account.status, pathname, router, soft]);

  if (account.status === "unknown") return <Waiting />;
  if (account.status === "out" && !soft) return <Waiting />;
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
