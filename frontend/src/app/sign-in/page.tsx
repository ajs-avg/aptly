"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { Nav } from "@/components/marketing/Nav";
import { Check, Eyebrow } from "@/components/marketing/primitives";
import { EASE, SPRING } from "@/components/motion/primitives";
import {
  authConfigured,
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Signing in, as part of the site rather than beside it.
 *
 * The first version was a bare card on an empty page — correct, and visibly
 * from a different product. It shared none of the landing page's furniture, so
 * arriving here felt like being handed off to somebody else's login screen at
 * the moment you were being asked to trust us with your CV.
 *
 * So it carries the same floating nav, the same card and type, and the same
 * two-column rhythm as the page it came from. The left column answers the
 * question the form cannot: what an account is actually for.
 */

type Mode = "signin" | "signup" | "link";

const COPY: Record<Mode, { title: string; blurb: string; action: string }> = {
  signin: {
    title: "Welcome back.",
    blurb: "Your applications, the CVs you sent, and the job posts as they stood.",
    action: "Sign in",
  },
  signup: {
    title: "Create your account.",
    blurb: "It takes a moment, and everything you tailor from here is kept.",
    action: "Create account",
  },
  link: {
    title: "No password needed.",
    blurb: "We will email you a link. Open it on this device and you are in.",
    action: "Email me a link",
  },
};

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignIn />
    </Suspense>
  );
}

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/tailor";

  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const copy = COPY[mode];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const result =
      mode === "signin"
        ? await signInWithPassword(email, password)
        : mode === "signup"
          ? await signUpWithPassword(email, password)
          : await sendMagicLink(email, `${window.location.origin}${next}`);

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

      <main className="gutter mx-auto max-w-content pb-24 pt-8 sm:pt-14">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-12">
          {/* ── What the account is for ──────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className="lg:pt-6"
          >
            <div className="flex justify-start">
              <Eyebrow>Your account</Eyebrow>
            </div>

            <h1
              className="pt-5 font-display font-semibold tracking-[-0.03em] text-ink"
              style={{ fontSize: "clamp(2rem, 4.2vw, 3rem)", lineHeight: 1.06 }}
            >
              Be ready when they call.
            </h1>

            <p className="max-w-md pt-4 text-lg leading-relaxed text-slate">
              A recruiter rings about something you sent five weeks ago. The job post
              is gone from the site and you cannot remember which version you sent.
              That is what this is for.
            </p>

            <ul className="max-w-md space-y-2.5 pt-7">
              <Check>Every application, with the CV you actually sent</Check>
              <Check>The job post frozen as it stood that day</Check>
              <Check>What to say on the call, and the gaps to own</Check>
            </ul>

            <p className="max-w-md pt-7 text-sm leading-relaxed text-slate">
              Your CV is read to tailor it and stored only against your own account.
              Nothing is shared, and you can erase all of it in one click.
            </p>
          </motion.div>

          {/* ── The form ─────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.08 }}
            className="rounded-2xl bg-raised shadow-hero ring-1 ring-ink/5"
          >
            {authConfigured ? (
              <form onSubmit={submit} className="p-6 sm:p-7">
                {/* Two tabs, because "sign in" and "create an account" are the
                    two things people arrive wanting, and a link buried under a
                    form is how they end up on the wrong one. */}
                <div className="flex gap-1 rounded-pill bg-sunken p-1">
                  {(["signin", "signup"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setMode(option);
                        setError(null);
                        setNotice(null);
                      }}
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

                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={EASE}
                    className="pt-6"
                  >
                    <h2 className="font-display text-lg font-semibold text-ink">
                      {copy.title}
                    </h2>
                    <p className="pt-1 text-sm leading-relaxed text-slate">{copy.blurb}</p>
                  </motion.div>
                </AnimatePresence>

                <div className="pt-5">
                  <Field
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                {mode !== "link" && (
                  <div className="pt-4">
                    <Field
                      label="Password"
                      type="password"
                      value={password}
                      onChange={setPassword}
                      // Tells a password manager to offer a new one rather than
                      // trying to fill a password that does not exist yet.
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      placeholder={mode === "signup" ? "At least 6 characters" : ""}
                      minLength={mode === "signup" ? 6 : undefined}
                      required
                    />
                  </div>
                )}

                <AnimatePresence>
                  {(error || notice) && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={EASE}
                      className={cn(
                        "overflow-hidden pt-4 text-sm leading-relaxed",
                        error ? "text-danger" : "text-signal",
                      )}
                      role={error ? "alert" : "status"}
                    >
                      {error ?? notice}
                    </motion.p>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-pill bg-signal font-display text-sm font-medium text-paper shadow-float transition-colors hover:bg-signal-hover disabled:opacity-50"
                >
                  {busy ? "…" : copy.action}
                </button>

                <div className="flex items-center gap-3 pt-5">
                  <span className="h-px flex-1 bg-hairline" />
                  <span className="font-display text-2xs uppercase tracking-[0.1em] text-slate">
                    or
                  </span>
                  <span className="h-px flex-1 bg-hairline" />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "link" ? "signin" : "link");
                    setError(null);
                    setNotice(null);
                  }}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-pill font-display text-sm text-ink ring-1 ring-hairline transition-colors hover:bg-sunken"
                >
                  {mode === "link" ? "Use a password instead" : "Email me a link instead"}
                </button>
              </form>
            ) : (
              <Unconfigured />
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}

/**
 * What this page says where no Supabase project is configured.
 *
 * Which is every local checkout. Rendering a form that cannot possibly work is
 * how somebody spends ten minutes deciding their password is wrong.
 */
function Unconfigured() {
  return (
    <div className="p-6 sm:p-7">
      <h2 className="font-display text-lg font-semibold text-ink">
        Accounts are not set up here yet.
      </h2>
      <p className="pt-2 text-sm leading-relaxed text-slate">
        This deployment has no Supabase project behind it, so there is nothing to
        sign in to. Everything else works.
      </p>
      <ul className="cv-literal space-y-1 pt-4 text-2xs text-slate">
        <li>NEXT_PUBLIC_SUPABASE_URL</li>
        <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
      </ul>
      <Link
        href="/tailor"
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-pill bg-signal font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
      >
        Tailor a CV instead
      </Link>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="block">
      <span className="font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate">
        {label}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // 16px, deliberately: iOS zooms the whole page in on focus for anything
        // smaller, and the way back out is not obvious.
        className="mt-1.5 h-12 w-full rounded-lg bg-sunken px-3.5 text-[1rem] text-ink ring-1 ring-hairline transition-shadow placeholder:text-slate/55 focus:outline-none focus:ring-2 focus:ring-signal"
      />
    </label>
  );
}
