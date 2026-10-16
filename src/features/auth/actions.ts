"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { supabaseConfig } from "@/lib/config/env-schema";
import { getPublicEnv } from "@/lib/config/public-env";
import { getServerEnv } from "@/lib/config/server-env";
import { logEvent } from "@/lib/observability/log";
import { FixedWindowRateLimiter, clientKeyFromRequest } from "@/lib/security/rate-limit";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  authErrorMessage,
  fieldErrorsFrom,
  signInSchema,
  signUpSchema,
  type AuthFormState,
} from "./credentials";
import { getAuthProviders } from "./providers";

/** Our own brake on credential attempts, on top of Supabase Auth's rate limits. */
const AUTH_ATTEMPTS_PER_MINUTE = 10;
const attempts = new FixedWindowRateLimiter({ limit: AUTH_ATTEMPTS_PER_MINUTE, windowMs: 60_000 });

const UNAVAILABLE: AuthFormState = { status: "error", message: "Sign-in isn't available on this site." };
const TOO_MANY: AuthFormState = { status: "error", message: "Too many attempts. Please wait a minute and try again." };

async function allowAttempt(): Promise<boolean> {
  const request = new Request("http://internal/auth", { headers: await headers() });
  return attempts.consume(clientKeyFromRequest(request, getServerEnv().TRUST_PROXY)).allowed;
}

/** Absolute URL on the configured app origin. Never derived from the request's Host header. */
function appUrl(path: string): string {
  return new URL(path, getPublicEnv().NEXT_PUBLIC_APP_URL).toString();
}

function nextFrom(formData: FormData): string {
  const raw = formData.get("next");
  return safeRedirectPath(typeof raw === "string" ? raw : null);
}

export async function signInAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return UNAVAILABLE;
  if (!(await allowAttempt())) return TOO_MANY;

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logEvent("warn", "auth_sign_in_failed", { code: error.code ?? "unknown" });
    return { status: "error", message: authErrorMessage(error) };
  }
  redirect(nextFrom(formData));
}

export async function signUpAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName") || undefined,
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return UNAVAILABLE;
  if (!(await allowAttempt())) return TOO_MANY;

  const next = nextFrom(formData);
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: appUrl(`/auth/confirm?${new URLSearchParams({ next }).toString()}`),
      data: parsed.data.displayName ? { full_name: parsed.data.displayName } : {},
    },
  });
  if (error) {
    logEvent("warn", "auth_sign_up_failed", { code: error.code ?? "unknown" });
    return { status: "error", message: authErrorMessage(error) };
  }
  if (data.session) {
    // Email confirmation is disabled for this project: signed in already.
    redirect(next);
  }
  // Same answer whether or not the address already has an account (no enumeration).
  return { status: "check-email", email: parsed.data.email };
}

export async function googleSignInAction(formData: FormData): Promise<void> {
  const config = supabaseConfig(getPublicEnv());
  const supabase = await createSupabaseServerClient();
  if (!supabase || !config) redirect("/login?error=unavailable");

  const next = nextFrom(formData);
  // Supabase returns an authorize URL even when Google is switched off, which
  // would strand the user on a raw JSON error page. Check first.
  if (!(await getAuthProviders(config)).google) {
    redirect(`/login?${new URLSearchParams({ error: "google-disabled", next }).toString()}`);
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: appUrl(`/auth/callback?${new URLSearchParams({ next }).toString()}`) },
  });

  const supabaseOrigin = new URL(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid").origin;
  if (error || !data.url || new URL(data.url).origin !== supabaseOrigin) {
    logEvent("warn", "auth_oauth_start_failed", { code: error?.code ?? "unexpected_url" });
    redirect("/login?error=oauth");
  }
  // PKCE: the code verifier was stored in a cookie by the server client.
  redirect(data.url);
}
