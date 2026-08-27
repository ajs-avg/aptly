"use client";

import { Suspense, useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { refreshAccount, useAccount } from "@/lib/account";
import { ApiError, resetPassword, signIn, signUp } from "@/lib/api";
import { Nav } from "@/components/marketing/Nav";
import { Showreel } from "@/components/marketing/Showreel";
import { EASE, SPRING } from "@/components/motion/primitives";
import {
  authConfigured,
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

type Mode = "signin" | "signup" | "reset";

const COPY: Record<Mode, { title: string; blurb: string; action: string }> = {
  signin: {
    title: "Welcome back",
    blurb: "Your applications, the CVs you sent, and the job posts as they stood.",
    action: "Sign in",
  },
  signup: {
    title: "Create your account",
    blurb: "It takes a moment, and everything you tailor from here is kept.",
    action: "Create my account",
  },
  reset: {
    title: "Reset your password",
    blurb: "Tell us the address you signed up with and we will send a way back in.",
    action: "Send reset link",
  },
};

/** The three things Aptly's own account card can be doing. */
type LocalMode = "signin" | "signup" | "reset";

const LOCAL_COPY: Record<LocalMode, { title: string; blurb: string; action: string }> = {
  signin: {
    title: "Welcome back",
    blurb: "Your applications, the CVs you sent, and the job posts as they stood.",
    action: "Sign in",
  },
  signup: {
    title: "Create your account",
    blurb: "A name, an address and a password. Everything you tailor is kept against it.",
    action: "Create my account",
  },
  reset: {
    title: "Set a new password",
    blurb: "Choose a new one and you will be signed in with it straight away.",
    action: "Set password and sign in",
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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const account = useAccount();
  const [localMode, setLocalMode] = useState<LocalMode>(
    params.get("mode") === "signup" ? "signup" : "signin",
  );

  const copy = COPY[mode];

  /*
   * Already signed in? Then this page is a dead end.
   *
   * Somebody reaching it with a live session — a bookmark, a back button, a
   * second tab — was previously shown a sign-in form that would refuse them for
   * having an account. Sending them where they were going is the only sensible
   * reading of the request.
   *
   * Read from the account store rather than from Supabase directly, so it is
   * true in the development mode too, where the session is a cookie this side
   * cannot see.
   */
  useEffect(() => {
    if (account.status === "in") router.replace(next);
  }, [account.status, next, router]);

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
          ? await signUpWithPassword(name, email, password)
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
    await refreshAccount();
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

            <p
              className="max-w-md pt-4 text-pretty leading-relaxed text-slate"
              style={{ fontSize: "clamp(1rem, 1.15vw, 1.15rem)" }}
            >
              A recruiter rings about something you sent five weeks ago. Here is
              what your account has waiting.
            </p>
          </motion.div>

          {/* Under the headline on a wide screen, under the card on a narrow
              one. Either way it is read by somebody deciding whether to bother,
              and what decides that is seeing the thing work rather than being
              told that it does. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.14 }}
            className="order-3 lg:order-none"
          >
            <Showreel />
          </motion.div>
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
                  {/* Height-animated so the card grows into the field rather
                      than jumping by its height when the tab changes. */}
                  <AnimatePresence initial={false}>
                    {mode === "signup" && (
                      <motion.div
                        key="name"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={EASE}
                        className="overflow-hidden"
                      >
                        <div className="pb-4">
                          <Field
                            label="Your name"
                            value={name}
                            onChange={setName}
                            autoComplete="name"
                            placeholder="Aman Mishra"
                            required
                            maxLength={80}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

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

                {/* Supabase's own reset, which is the emailed link. No magic-link
                    sign-in beside it: two passwordless ways in, one of which is
                    a sign-in and the other a recovery, read as the same button
                    twice — and both spend the free tier's handful of emails an
                    hour on a demo. */}
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => go("reset")}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-pill px-4 font-display text-sm text-ink ring-1 ring-hairline transition-colors hover:bg-sunken"
                  >
                    I have forgotten my password
                  </button>
                )}
                {mode !== "signin" && (
                  <button
                    type="button"
                    onClick={() => go("signin")}
                    className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-pill px-4 font-display text-sm text-ink ring-1 ring-hairline transition-colors hover:bg-sunken"
                  >
                    Back to signing in
                  </button>
                )}
              </div>
            ) : (
              <LocalAccount next={next} mode={localMode} onMode={setLocalMode} />
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

/**
 * Aptly's own accounts: an email, a password, and a name.
 *
 * In force wherever Supabase is not configured. It used to be email-only with
 * no password at all — anybody who typed an address owned that account — and it
 * is a real credential now, hashed with scrypt on the server.
 *
 * Three things one card can do, because they are three answers to the same
 * question and splitting them across pages makes people navigate to find out
 * which one they needed:
 *
 * - **Sign in.** Email and password.
 * - **Create account.** A name as well, asked once and used everywhere after —
 *   the alternative is greeting somebody by the first half of their address for
 *   the life of the account.
 * - **Reset.** A new password, set directly. The server decides whether that is
 *   allowed and refuses in production, so the option only appears when the
 *   session says `direct_reset` — a build that offers a reset the server will
 *   refuse is worse than one that does not offer it.
 */
function LocalAccount({ next, mode, onMode }: {
  next: string;
  mode: LocalMode;
  onMode: (mode: LocalMode) => void;
}) {
  const router = useRouter();
  const account = useAccount();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = LOCAL_COPY[mode];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await signUp(name, email, password);
      else if (mode === "reset") await resetPassword(email, password);
      else await signIn(email, password);

      // Before navigating. The nav and the gate on the next screen both read
      // the account store, and neither has any way to learn about a cookie the
      // browser will not let them see.
      await refreshAccount();
      router.push(next);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? [caught.message, caught.hint].filter(Boolean).join(" ")
          : "Aptly could not reach the server.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-raised p-5 shadow-hero ring-1 ring-ink/5 sm:p-6">
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={EASE}
          className="pb-5"
        >
          <h2 className="font-display text-lg font-semibold text-ink">{copy.title}</h2>
          <p className="pt-1 text-sm leading-relaxed text-slate">{copy.blurb}</p>
        </motion.div>
      </AnimatePresence>

      {mode !== "reset" && (
        <div className="flex gap-1 rounded-pill bg-sunken p-1">
          {(["signin", "signup"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onMode(option)}
              aria-pressed={mode === option}
              className="relative flex-1 rounded-pill py-2 font-display text-xs font-medium"
            >
              {mode === option && (
                <motion.span
                  layoutId="local-tab"
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

      <form onSubmit={submit} className={cn(mode !== "reset" && "pt-4")}>
        {/* Height-animated so the card grows into the name field rather than
            jumping by its height the instant the tab changes. */}
        <AnimatePresence initial={false}>
          {mode === "signup" && (
            <motion.div
              key="name"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={EASE}
              className="overflow-hidden"
            >
              <div className="pb-4">
                <Field
                  label="Your name"
                  value={name}
                  onChange={setName}
                  autoComplete="name"
                  placeholder="Aman Mishra"
                  required
                  maxLength={80}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          required
        />

        <div className="pt-4">
          <Field
            label={mode === "reset" ? "New password" : "Password"}
            type={reveal ? "text" : "password"}
            value={password}
            onChange={setPassword}
            // Tells a password manager to offer a new one rather than trying to
            // fill one that does not exist yet.
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder={mode === "signin" ? "" : "At least 8 characters"}
            minLength={mode === "signin" ? undefined : 8}
            required
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

        <AnimatePresence initial={false}>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={EASE}
              className="overflow-hidden"
            >
              <p
                role="alert"
                className="mt-4 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm leading-relaxed text-danger"
              >
                {error}
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

      {/* Only where the server will honour it. `direct_reset` is off in
          production, where the emailed link is the only way back in. */}
      {mode === "signin" && account.directReset && (
        <button
          type="button"
          onClick={() => onMode("reset")}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-pill px-4 font-display text-sm text-ink ring-1 ring-hairline transition-colors hover:bg-sunken"
        >
          I have forgotten my password
        </button>
      )}
      {mode === "reset" && (
        <button
          type="button"
          onClick={() => onMode("signin")}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-pill px-4 font-display text-sm text-ink ring-1 ring-hairline transition-colors hover:bg-sunken"
        >
          Back to signing in
        </button>
      )}

      {mode === "reset" && (
        <div className="mt-5 rounded-lg bg-amber-soft px-3.5 py-3">
          <p className="font-display text-2xs font-semibold uppercase tracking-[0.1em] text-amber-ink">
            No email step yet
          </p>
          <p className="pt-1.5 text-2xs leading-relaxed text-ink/80">
            This sets the password straight away, without checking that the
            address is yours. It is here so the flow can be shown, and it is
            switched off in production — where a reset link will be emailed
            instead.
          </p>
        </div>
      )}
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
