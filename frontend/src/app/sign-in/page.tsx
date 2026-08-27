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
 * Two columns on a wide screen: what an account is for on the left, the form on
 * the right. A centred single column was tried in between and read as empty —
 * a small card adrift in a page with nothing either side of it — which is the
 * failure a sign-in page has when it says nothing while asking for something.
 *
 * What the two-column version had to fix was alignment, and it does that by
 * construction rather than by eye: both columns are children of one grid row,
 * so the headline and the top of the card start on the same line at every
 * width. No column carries a hand-picked top padding to make it look level at
 * one of them.
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
       * Two columns on a wide screen, one on a narrow one — and the order
       * changes between them, which is the whole reason for the shape below.
       *
       * Wide: the pitch on the left, the card on the right, both starting at
       * the top of the same row. Narrow: headline, then the card, then the
       * reasons — because the form is what somebody came for and it should not
       * sit under three paragraphs arguing that they should want it.
       *
       * So the left column's two halves are wrapped in `display: contents`
       * until `lg`. Below that the wrapper is not a box at all and its children
       * are direct children of this flex row, where `order` can put the card
       * between them. At `lg` the wrapper becomes a real column and they stack
       * inside it.
       *
       * The alternative — three grid cells with the card spanning both rows —
       * is what this looked like twenty minutes ago, and a spanning card sets
       * the height of the row above the reasons, so they landed most of a card
       * further down the page with nothing in the gap.
       */}
      <main className="gutter mx-auto max-w-content pb-20 pt-10 sm:pt-14">
        <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-x-14 xl:gap-x-20">
          <div className="contents lg:flex lg:flex-col lg:gap-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="order-1 lg:order-none"
          >
            <p className="flex items-center gap-2 font-display text-2xs font-medium uppercase tracking-[0.16em] text-signal">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-signal" />
              Your account
            </p>

            <h1
              className="text-balance pt-5 font-display font-semibold tracking-[-0.035em] text-ink"
              style={{ fontSize: "clamp(2rem, 4.6vw, 3rem)", lineHeight: 1.06 }}
            >
              Be ready when they call.
            </h1>

            <p className="max-w-md pt-4 text-pretty leading-relaxed text-slate" style={{ fontSize: "clamp(1rem, 1.15vw, 1.15rem)" }}>
              A recruiter rings about something you sent five weeks ago. The job
              post is gone from the site and you cannot remember which version you
              sent. That is what this is for.
            </p>
          </motion.div>

          {/* Under the headline on a wide screen, under the card on a narrow
              one. Either way it is read by somebody deciding whether to bother,
              not by somebody already typing. */}
          <motion.ul
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.14 }}
            className="order-3 grid max-w-md gap-3 lg:order-none"
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
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.08 }}
            className="order-2 lg:order-none"
          >
            {/* No top padding. The card's edge and the headline's cell both
                start at the top of row 1, and any offset added here to make
                them "look" level is an offset that is wrong at every width
                except the one it was eyeballed at. */}
            {authConfigured ? (
              <div className="rounded-2xl bg-raised p-5 shadow-hero ring-1 ring-ink/5 sm:p-6">
                {/* The card's own title, because it changes with the mode and
                    the headline beside it does not. Height-animated so
                    switching to a reset does not jolt the column. */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={EASE}
                    className="pb-5"
                  >
                    <h2 className="font-display text-lg font-semibold text-ink">
                      {copy.title}
                    </h2>
                    <p className="pt-1 text-sm leading-relaxed text-slate">{copy.blurb}</p>
                  </motion.div>
                </AnimatePresence>

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

                <form onSubmit={submit} className={cn(NEEDS_PASSWORD.has(mode) && "pt-4")}>
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

            <p className="pt-5 text-2xs leading-relaxed text-slate">
              Your CV is read to tailor it and stored only against your own
              account. Nothing is shared, and you can erase all of it in one click.
            </p>
          </motion.div>
        </div>
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
