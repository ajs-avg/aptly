"use client";

import { Suspense, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { ApiError, signIn } from "@/lib/api";
import { Nav } from "@/components/marketing/Nav";
import { EASE, SPRING } from "@/components/motion/primitives";
import {
  authConfigured,
  currentSession,
  sendMagicLink,
  sendPasswordReset,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Signing in.
 *
 * One centred column, and that is the design decision rather than an absence of
 * one. A sign-in page has exactly one job, and the two-column arrangement it
 * replaces spent half the screen arguing for the account while the form — the
 * only thing anybody came here to use — sat in a narrow gutter on the right,
 * starting on a different line from the words beside it at every width between
 * the two breakpoints it was tuned for.
 *
 * Centred, there is one measure to get right instead of two to keep in step.
 * Every element in the card shares one left edge, the card shares its centre
 * with the nav above it, and nothing needs a breakpoint to stay aligned —
 * because there is nothing beside it to fall out of line with.
 *
 * The reasons to have an account still get made, underneath, where they are
 * read by somebody deciding rather than by somebody typing.
 */

type Mode = "signin" | "signup" | "link" | "reset";

const COPY: Record<Mode, { title: string; blurb: string; action: string }> = {
  signin: {
    title: "Welcome back",
    blurb: "Your applications, the CVs you sent, and the job posts as they stood.",
    action: "Sign in",
  },
  signup: {
    title: "Create your account",
    blurb: "It takes a moment, and everything you tailor from here is kept.",
    action: "Create account",
  },
  link: {
    title: "No password needed",
    blurb: "We will email you a link. Open it on this device and you are in.",
    action: "Email me a link",
  },
  reset: {
    title: "Reset your password",
    blurb: "Tell us the address you signed up with and we will send a way back in.",
    action: "Send reset link",
  },
};

/** Whether the password field is part of this mode at all. */
const NEEDS_PASSWORD: ReadonlySet<Mode> = new Set<Mode>(["signin", "signup"]);

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-mist" />}>
      <SignIn />
    </Suspense>
  );
}

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/tailor";

  const [mode, setMode] = useState<Mode>(
    params.get("mode") === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const copy = COPY[mode];

  /*
   * Already signed in? Then this page is a dead end.
   *
   * Somebody reaching it with a live session — a bookmark, a back button, a
   * second tab — was previously shown a sign-in form that would refuse them for
   * having an account. Sending them where they were going is the only sensible
   * reading of the request.
   */
  useEffect(() => {
    if (!authConfigured) return;
    let live = true;
    void currentSession().then((session) => {
      if (live && session) router.replace(next);
    });
    return () => {
      live = false;
    };
  }, [next, router]);

  const go = (to: Mode) => {
    setMode(to);
    setError(null);
    setNotice(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const origin = window.location.origin;
    const result =
      mode === "signin"
        ? await signInWithPassword(email, password)
        : mode === "signup"
          ? await signUpWithPassword(email, password)
          : mode === "link"
            ? await sendMagicLink(email, `${origin}${next}`)
            : await sendPasswordReset(email, `${origin}/sign-in`);

    setBusy(false);

    if (!result.ok) {
      setError(result.message ?? "That did not work.");
      return;
    }
    // A message alongside a successful result means there is something left to
    // do — confirm an address, open a link — so we stay put and say so.
    if (result.message) {
      setNotice(result.message);
      return;
    }
    router.push(next);
  };

  return (
    <div className="min-h-dvh bg-mist">
      <Nav />

      {/*
       * One measure, `max-w-sm`, and everything inside shares it: the card, the
       * heading above it, the reassurance below. That is what makes the column
       * read as one object rather than as three that happen to be near each
       * other — and it holds at 320px and at 2560 without a breakpoint, because
       * a centred column has nothing to stay in step with.
       */}
      <main className="gutter mx-auto flex max-w-sm flex-col pb-20 pt-10 sm:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
        >
          <div className="text-center">
            <h1
              className="text-balance font-display font-semibold tracking-[-0.03em] text-ink"
              style={{ fontSize: "clamp(1.75rem, 6vw, 2.25rem)", lineHeight: 1.1 }}
            >
              {authConfigured ? copy.title : "Sign in"}
            </h1>
            <p className="mx-auto max-w-xs pt-2.5 text-sm leading-relaxed text-slate">
              {authConfigured
                ? copy.blurb
                : "Your email is enough here. Everything you tailor from now on is kept against it."}
            </p>
          </div>

          <div className="pt-7">
            {authConfigured ? (
              <div className="rounded-2xl bg-raised p-5 shadow-hero ring-1 ring-ink/5 sm:p-6">
                {/* Only where there is a choice to make. In reset and magic-link
                    the tabs would offer to switch away from the thing the person
                    has just chosen to do. */}
                {NEEDS_PASSWORD.has(mode) && (
                  <div className="flex gap-1 rounded-pill bg-sunken p-1">
                    {(["signin", "signup"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => go(option)}
                        aria-pressed={mode === option}
                        className="relative flex-1 rounded-pill py-2 font-display text-xs font-medium"
                      >
                        {mode === option && (
                          <motion.span
                            layoutId="auth-tab"
                            className="absolute inset-0 rounded-pill bg-raised shadow-raised"
                            transition={SPRING}
                          />
                        )}
                        <span
                          className={cn(
                            "relative transition-colors",
                            mode === option ? "text-ink" : "text-slate",
                          )}
                        >
                          {option === "signin" ? "Sign in" : "Create account"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                <form onSubmit={submit} className={cn(NEEDS_PASSWORD.has(mode) && "pt-5")}>
                  <Field
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    autoFocus
                  />

                  {/* Height is animated, so the card grows into the password
                      field rather than jumping by its height the instant the
                      mode changes. */}
                  <AnimatePresence initial={false}>
                    {NEEDS_PASSWORD.has(mode) && (
                      <motion.div
                        key="password"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={EASE}
                        className="overflow-hidden"
                      >
                        <div className="pt-4">
                          <Field
                            label="Password"
                            type={reveal ? "text" : "password"}
                            value={password}
                            onChange={setPassword}
                            // Tells a password manager to offer a new one rather
                            // than trying to fill one that does not exist yet.
                            autoComplete={
                              mode === "signup" ? "new-password" : "current-password"
                            }
                            placeholder={mode === "signup" ? "At least 6 characters" : ""}
                            minLength={mode === "signup" ? 6 : undefined}
                            required={NEEDS_PASSWORD.has(mode)}
                            aside={
                              <button
                                type="button"
                                onClick={() => setReveal((value) => !value)}
                                className="font-display text-2xs font-medium text-slate transition-colors hover:text-ink"
                              >
                                {reveal ? "Hide" : "Show"}
                              </button>
                            }
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence initial={false}>
                    {(error || notice) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={EASE}
                        className="overflow-hidden"
                      >
                        <p
                          role={error ? "alert" : "status"}
                          className={cn(
                            "mt-4 rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
                            error
                              ? "bg-danger-soft text-danger"
                              : "bg-signal-soft text-signal",
                          )}
                        >
                          {error ?? notice}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-pill bg-signal font-display text-sm font-medium text-paper shadow-float transition-colors hover:bg-signal-hover disabled:opacity-50"
                  >
                    {busy ? "One moment…" : copy.action}
                  </button>
                </form>

                <div className="flex items-center gap-3 pt-5">
                  <span className="h-px flex-1 bg-hairline" />
                  <span className="font-display text-2xs uppercase tracking-[0.1em] text-slate">
                    or
                  </span>
                  <span className="h-px flex-1 bg-hairline" />
                </div>

                {/* Every way out of the current mode, on one grid so they share
                    a width and a baseline whatever combination is showing. */}
                <div className="grid gap-2 pt-4">
                  {mode !== "link" && (
                    <Secondary onClick={() => go("link")}>
                      Email me a link instead
                    </Secondary>
                  )}
                  {mode === "signin" && (
                    <Secondary onClick={() => go("reset")}>
                      I have forgotten my password
                    </Secondary>
                  )}
                  {mode !== "signin" && (
                    <Secondary onClick={() => go("signin")}>
                      Back to signing in
                    </Secondary>
                  )}
                </div>
              </div>
            ) : (
              <DevelopmentSignIn next={next} />
            )}
          </div>

          <p className="pt-6 text-center text-2xs leading-relaxed text-slate">
            Your CV is read to tailor it and stored only against your own account.
            Nothing is shared, and you can erase all of it in one click.
          </p>
        </motion.div>

        {/* The argument for having an account, under the thing it is arguing
            for. Somebody who arrived to sign in is not reading this; somebody
            deciding whether to is, and they scroll. */}
        <motion.ul
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: 0.1 }}
          className="grid gap-2.5 pt-10"
        >
          {[
            ["Every application", "With the CV you actually sent, not a copy of it."],
            ["The post, frozen", "Exactly as it stood the day you applied."],
            ["What to say", "Your fit points and the gaps to own, before the call."],
          ].map(([title, body]) => (
            <li key={title} className="flex items-start gap-3">
              <Tick />
              <p className="text-sm leading-relaxed text-slate">
                <span className="font-medium text-ink">{title}. </span>
                {body}
              </p>
            </li>
          ))}
        </motion.ul>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

function Secondary({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 w-full items-center justify-center rounded-pill px-4 font-display text-sm text-ink ring-1 ring-hairline transition-colors hover:bg-sunken"
    >
      {children}
    </button>
  );
}

/**
 * Signing in where no Supabase project is configured.
 *
 * This page used to stop here and say "accounts are not set up yet", which was
 * true about Supabase and wrong about the deployment: there *is* a working
 * sign-in in this mode — email only, no password — and it was reachable from a
 * small box tucked into the Library's toolbar and nowhere else. So the page
 * everybody navigates to in order to sign in was the one place that could not.
 *
 * The same sign-in lives here now. What it cannot do is pretend to be the other
 * one: it has no password, so anybody who knows an address can open that
 * account, and the warning says so in those words rather than as "development
 * mode", which reads as a reassurance to anyone who does not already know what
 * it means.
 */
function DevelopmentSignIn({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email);
      router.push(next);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Aptly could not reach the server to sign you in.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-raised p-5 shadow-hero ring-1 ring-ink/5 sm:p-6">
      <form onSubmit={submit}>
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          required
          autoFocus
        />

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm leading-relaxed text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-pill bg-signal font-display text-sm font-medium text-paper shadow-float transition-colors hover:bg-signal-hover disabled:opacity-50"
        >
          {busy ? "One moment…" : "Continue"}
        </button>
      </form>

      <div className="mt-5 rounded-lg bg-amber-soft px-3.5 py-3">
        <p className="font-display text-2xs font-semibold uppercase tracking-[0.1em] text-amber-ink">
          No password on this deployment
        </p>
        <p className="pt-1.5 text-2xs leading-relaxed text-ink/80">
          Anyone who types your address can open your applications. Fine for
          trying Aptly out; do not keep anything here you would mind a stranger
          reading.
        </p>
        <p className="pt-2 text-2xs leading-relaxed text-slate">
          Real accounts need a Supabase project —{" "}
          <span className="cv-literal">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
          <span className="cv-literal">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> on the
          web service, <span className="cv-literal">SUPABASE_URL</span> on the API.
        </p>
      </div>

      <Link
        href="/tailor"
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-pill font-display text-sm text-ink ring-1 ring-hairline transition-colors hover:bg-sunken"
      >
        Skip — tailor a CV without an account
      </Link>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  aside,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** A control that belongs to this field, on its label's line. */
  aside?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  const id = useId();

  return (
    <div>
      {/* The label and its control on one row, so "Show" sits on the label's
          baseline rather than floating over the input's right edge where it
          overlaps whatever has been typed. */}
      <div className="flex items-baseline justify-between gap-3 pb-1.5">
        <label
          htmlFor={id}
          className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate"
        >
          {label}
        </label>
        {aside}
      </div>
      <input
        {...rest}
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // 16px, deliberately: iOS zooms the whole page in on focus for anything
        // smaller, and the way back out is not obvious.
        className="h-12 w-full rounded-lg bg-sunken px-3.5 text-[1rem] text-ink ring-1 ring-hairline transition-shadow placeholder:text-slate/55 focus:outline-none focus:ring-2 focus:ring-signal"
      />
    </div>
  );
}

function Tick() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="mt-1 h-3.5 w-3.5 shrink-0 text-signal"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 8.5l3.5 3.5 7.5-8" />
    </svg>
  );
}
