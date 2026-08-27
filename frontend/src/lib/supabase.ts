"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth, when it is configured.
 *
 * Both halves of the product have to work without it. Where there is no
 * Supabase project, Aptly's own accounts stand in — the same email, password
 * and name, verified by the API against a scrypt hash. So everything here is
 * written to answer "is Supabase available?" rather than to assume it is:
 * `client()` returns null when the keys are absent, and every caller has a path
 * for that.
 *
 * The anonymous visitor is untouched either way. They are the person this
 * product is designed around — they tailor a CV before being asked for
 * anything — and their work is held under a cookie the API owns, in both modes.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

/** True when this deployment has real authentication behind it. */
export const authConfigured = Boolean(URL && ANON_KEY);

let cached: SupabaseClient | null = null;

/**
 * The browser client, or null when Supabase is not configured.
 *
 * Built once and reused: each client opens its own auth listener and token
 * refresh timer, so creating one per render leaks both.
 */
export function client(): SupabaseClient | null {
  if (!authConfigured) return null;
  cached ??= createClient(URL!, ANON_KEY!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The token has to survive a reload, and this is a single-page app with
      // no server session of its own — the API verifies the JWT on every call.
      detectSessionInUrl: true,
    },
  });
  return cached;
}

/**
 * The current access token, refreshed if it has expired.
 *
 * Read on every API call rather than captured once. Supabase rotates the access
 * token roughly hourly, and a token captured at page load is one the API starts
 * rejecting mid-session — which surfaces as the Library going empty rather than
 * as a sign-in prompt.
 */
export async function accessToken(): Promise<string | null> {
  const supabase = client();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function currentSession(): Promise<Session | null> {
  const supabase = client();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export interface AuthResult {
  ok: boolean;
  /** Set when the person has to do something before they can continue. */
  message?: string;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult> {
  const supabase = client();
  if (!supabase) return { ok: false, message: "Sign-in is not configured on this deployment." };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, message: readable(error.message) } : { ok: true };
}

export async function signUpWithPassword(
  name: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  const supabase = client();
  if (!supabase) return { ok: false, message: "Sign-up is not configured on this deployment." };

  // The name rides along in user metadata, which is where Supabase keeps
  // anything about a person that is not a credential. Asked for once, at
  // sign-up, so nothing has to greet them by half their email address.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: name.trim() } },
  });
  if (error) return { ok: false, message: readable(error.message) };

  // With email confirmation on, Supabase returns a user but no session. Saying
  // "check your email" is the difference between a person waiting for a page
  // that will never load and a person opening their inbox.
  if (!data.session) {
    return { ok: true, message: "Check your email to confirm the address, then sign in." };
  }
  return { ok: true };
}

/**
 * Start a password reset.
 *
 * The one path a sign-in page cannot do without. Somebody who has forgotten
 * their password has no way back in, and "create an account" is the wrong
 * answer — Supabase refuses a second account on the same address, so they hit a
 * dead end twice.
 *
 * The reply is deliberately the same whether or not the address is one we know.
 * Anything else turns this box into a way to ask "does this person have an
 * account here?", and the answer to that is nobody's business.
 */
export async function sendPasswordReset(
  email: string,
  redirectTo: string,
): Promise<AuthResult> {
  const supabase = client();
  if (!supabase) return { ok: false, message: "Sign-in is not configured on this deployment." };

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { ok: false, message: readable(error.message) };
  return {
    ok: true,
    message: "If that address has an account, a reset link is on its way to it.",
  };
}

export async function signOutEverywhere(): Promise<void> {
  await client()?.auth.signOut();
}

/**
 * Supabase's errors in the product's voice.
 *
 * The raw strings are written for developers — "Invalid login credentials" is
 * accurate and tells somebody nothing about what to do next. The design doc's
 * rule is that an error says what happened *and* how to fix it.
 */
function readable(message: string): string {
  const text = message.toLowerCase();

  if (text.includes("invalid login credentials")) {
    return "That email and password do not match. Check both, or create an account.";
  }
  if (text.includes("email not confirmed")) {
    return "This address is not confirmed yet. Open the link in your inbox first.";
  }
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "There is already an account with this address. Sign in instead.";
  }
  if (text.includes("password") && text.includes("6")) {
    return "Passwords need at least six characters.";
  }
  // Almost always the email quota rather than a password-guessing limit:
  // Supabase's built-in mailer sends only a handful an hour on the free tier,
  // and every sign-up and magic link spends one. Saying "wait a minute" sent
  // people back to try again into the same wall.
  if (text.includes("rate limit") || text.includes("too many") || text.includes("for security")) {
    return (
      "Supabase is rate-limiting emails from this project — its free mailer only " +
      "sends a few an hour. Sign in with a password instead, or turn off " +
      "Authentication → Email → Confirm email in Supabase so no email is needed."
    );
  }
  return message;
}
