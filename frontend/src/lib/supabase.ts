"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth, when it is configured.
 *
 * Both halves of the product have to work without it. Locally there is no
 * Supabase project, and the development sign-in stands in — email only, no
 * password, and it refuses to run in production for exactly that reason. So
 * everything here is written to answer "is real auth available?" rather than to
 * assume it is: `client()` returns null when the keys are absent, and every
 * caller has a path for that.
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
  email: string,
  password: string,
): Promise<AuthResult> {
  const supabase = client();
  if (!supabase) return { ok: false, message: "Sign-up is not configured on this deployment." };

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, message: readable(error.message) };

  // With email confirmation on, Supabase returns a user but no session. Saying
  // "check your email" is the difference between a person waiting for a page
  // that will never load and a person opening their inbox.
  if (!data.session) {
    return { ok: true, message: "Check your email to confirm the address, then sign in." };
  }
  return { ok: true };
}

export async function sendMagicLink(email: string, redirectTo: string): Promise<AuthResult> {
  const supabase = client();
  if (!supabase) return { ok: false, message: "Sign-in is not configured on this deployment." };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  return error
    ? { ok: false, message: readable(error.message) }
    : { ok: true, message: "Link sent. Open it on this device to finish signing in." };
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
  if (text.includes("rate limit") || text.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return message;
}
