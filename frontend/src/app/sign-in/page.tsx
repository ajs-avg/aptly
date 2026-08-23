"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { EASE, SPRING } from "@/components/motion/primitives";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  authConfigured,
  sendMagicLink,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Signing in.
 *
 * Deliberately quiet. Everything valuable in this product happens *before* an
 * account — a stranger can tailor a CV end to end without one — so this page is
 * not a gate, it is the moment somebody decides they want to keep what they
 * already have. Selling to them here would be selling something they have
 * already bought.
 *
 * Three ways in, in the order people actually want them: password for somebody
 * returning, an account for somebody new, and a link for somebody who does not
 * want a password at all.
 */

type Mode = "signin" | "signup" | "link";

const COPY: Record<Mode, { title: string; blurb: string; action: string }> = {
  signin: {
    title: "Welcome back.",
    blurb: "Your applications, the CVs you sent, and the job posts as they stood.",
    action: "Sign in",
  },
  signup: {
    title: "Keep what you have made.",
    blurb:
      "An account is only for remembering. Everything you have tailored so far comes with you.",
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
  const next = params.get("next") ?? "/library";

  const [mode, setMode] = useState<Mode>("signin");
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
    // A message with a successful result means there is something left to do —
    // confirm an address, open a link — so we stay put and say so.
    if (result.message) {
      setNotice(result.message);
      return;
    }
    router.push(next);
  };

  return (
    <div className="min-h-dvh bg-mist">
      <header className="gutter mx-auto flex max-w-content items-center justify-between py-5">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight text-ink transition-colors hover:text-signal"
        >
          <Mark />
          Aptly
        </Link>
        <ThemeToggle />
      </header>

      <main className="gutter mx-auto grid max-w-content place-items-center pb-20 pt-6 sm:pt-12">
        <div className="w-full max-w-sm">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={EASE}
              >
                <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
                  {copy.title}
                </h1>
                <p className="pt-2 text-base leading-relaxed text-slate">{copy.blurb}</p>
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {!authConfigured ? (
            <Unconfigured />
          ) : (
            <motion.form
              onSubmit={submit}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: 0.06 }}
              className="mt-8 rounded-2xl bg-raised p-5 shadow-float ring-1 ring-ink/5 sm:p-6"
            >
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />

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
                      "overflow-hidden pt-3 text-sm leading-relaxed",
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
                className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-pill bg-signal font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover disabled:opacity-50"
              >
                {busy ? "…" : copy.action}
              </button>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-4">
                {mode !== "signin" && (
                  <Switch onClick={() => setMode("signin")}>I already have an account</Switch>
                )}
                {mode !== "signup" && (
                  <Switch onClick={() => setMode("signup")}>Create an account</Switch>
                )}
                {mode !== "link" && (
                  <Switch onClick={() => setMode("link")}>Email me a link instead</Switch>
                )}
              </div>
            </motion.form>
          )}

          <p className="pt-6 text-center text-2xs leading-relaxed text-slate">
            <Link href="/tailor" className="text-signal underline decoration-hairline underline-offset-2">
              Try it first
            </Link>{" "}
            — an account is what keeps what you make.
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * What this page says on a deployment with no Supabase project behind it.
 *
 * Which is every local checkout. Rendering a form that cannot possibly work is
 * how somebody spends ten minutes deciding their password is wrong.
 */
function Unconfigured() {
  return (
    <div className="mt-8 rounded-2xl bg-raised p-5 shadow-float ring-1 ring-ink/5 sm:p-6">
      <p className="text-sm leading-relaxed text-ink">
        Accounts are not configured on this deployment.
      </p>
      <p className="pt-2 text-sm leading-relaxed text-slate">
        Set <code className="cv-literal text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="cv-literal text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{" "}
        <code className="cv-literal text-ink">SUPABASE_JWT_SECRET</code> on the API.
      </p>
      <Link
        href="/tailor"
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-pill bg-signal font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
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
        className="mt-1.5 h-11 w-full rounded-lg bg-sunken px-3 text-[1rem] text-ink ring-1 ring-hairline transition-shadow placeholder:text-slate/55 focus:outline-none focus:ring-2 focus:ring-signal"
      />
    </label>
  );
}

function Switch({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display text-2xs text-slate underline decoration-hairline underline-offset-2 transition-colors hover:text-ink"
    >
      {children}
    </button>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-signal" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h8l4 4v14H6z" />
      <path strokeLinecap="round" d="M9 12h6M9 16h4" />
    </svg>
  );
}
