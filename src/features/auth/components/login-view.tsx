"use client";

import { AlertCircle, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { safeRedirectPath } from "@/lib/security/safe-redirect";

import { googleSignInAction, signInAction, signUpAction } from "../actions";
import { useAuth } from "../auth-provider";
import { INITIAL_AUTH_STATE, PASSWORD_MIN_LENGTH, type AuthFormState } from "../credentials";

type Mode = "sign-in" | "sign-up";

const QUERY_ERRORS: Record<string, string> = {
  oauth: "Google sign-in didn't complete. Please try again.",
  confirm: "That confirmation link is invalid or has expired. Sign in, or create your account again.",
  unavailable: "Sign-in isn't available on this site.",
  "google-disabled": "Google sign-in isn't enabled on this site yet. Use your email and password instead.",
};

const INPUT_CLASS =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function LoginView() {
  const auth = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirectPath(searchParams.get("next"));
  const queryError = QUERY_ERRORS[searchParams.get("error") ?? ""];
  const [mode, setMode] = useState<Mode>("sign-in");

  // Already signed in (e.g. returning to /login): continue where they were going.
  useEffect(() => {
    if (auth.status === "signed-in") router.replace(next);
  }, [auth.status, next, router]);

  if (auth.status === "unavailable") {
    return (
      <div className="flex flex-col gap-3" data-testid="auth-unavailable">
        <h1 className="text-2xl font-semibold tracking-tight">Sign-in isn&apos;t available</h1>
        <p className="text-muted-foreground">
          Accounts aren&apos;t set up on this site yet. You can still search for cafes as a guest.
        </p>
        <Button asChild size="lg" className="min-h-11 w-fit px-4">
          <Link href="/">Search for cafes</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "sign-in" ? "Sign in" : "Create your account"}
        </h1>
        <p className="text-muted-foreground">
          Save favorite cafes and your search preferences. Searching never needs an account.
        </p>
      </div>

      <div role="group" aria-label="Account" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(["sign-in", "sign-up"] as const).map((option) => (
          <Button
            key={option}
            type="button"
            size="lg"
            variant={mode === option ? "outline" : "ghost"}
            className="min-h-11 border-transparent aria-pressed:bg-card aria-pressed:shadow-xs"
            aria-pressed={mode === option}
            onClick={() => setMode(option)}
          >
            {option === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        ))}
      </div>

      {queryError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{queryError}</AlertDescription>
        </Alert>
      )}

      {/* Remount on mode change so each form keeps its own state. */}
      <CredentialsForm key={mode} mode={mode} next={next} />

      <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={googleSignInAction}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" size="lg" variant="outline" className="min-h-11 w-full">
          Continue with Google
        </Button>
      </form>
    </div>
  );
}

function CredentialsForm({ mode, next }: { mode: Mode; next: string }) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    mode === "sign-in" ? signInAction : signUpAction,
    INITIAL_AUTH_STATE,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors ?? {} : {};

  if (state.status === "check-email") {
    return (
      <Alert role="status">
        <MailCheck aria-hidden="true" />
        <AlertTitle>Check your email</AlertTitle>
        <AlertDescription>
          If {state.email} can be used, we&apos;ve sent a confirmation link to it. Open it to finish
          creating your account.
        </AlertDescription>
      </Alert>
    );
  }

  const field = (name: "email" | "password" | "displayName") => ({
    id: `${id}-${name}`,
    name,
    "aria-invalid": fieldErrors[name] ? true : undefined,
    "aria-describedby": fieldErrors[name] ? `${id}-${name}-error` : undefined,
  });
  const errorText = (name: "email" | "password" | "displayName") =>
    fieldErrors[name] && (
      <p id={`${id}-${name}-error`} className="text-sm text-destructive">
        {fieldErrors[name]}
      </p>
    );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate aria-label={mode === "sign-in" ? "Sign in" : "Create account"}>
      <input type="hidden" name="next" value={next} />
      {state.status === "error" && state.message && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {mode === "sign-up" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-displayName`} className="text-sm font-medium">
            Name <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input {...field("displayName")} type="text" autoComplete="name" maxLength={80} className={INPUT_CLASS} />
          {errorText("displayName")}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="text-sm font-medium">
          Email
        </label>
        <input {...field("email")} type="email" autoComplete="email" required className={INPUT_CLASS} />
        {errorText("email")}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-password`} className="text-sm font-medium">
          Password
        </label>
        <div className="relative"><input
          {...field("password")}
          type={showPassword ? "text" : "password"}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          required
          minLength={mode === "sign-up" ? PASSWORD_MIN_LENGTH : undefined}
          className={`${INPUT_CLASS} pr-20`}
        /><button type="button" aria-pressed={showPassword} aria-controls={`${id}-password`} onClick={() => setShowPassword((shown) => !shown)} className="absolute inset-y-0 right-1 min-h-11 rounded-lg px-3 text-sm font-medium text-primary hover:bg-secondary">{showPassword ? "Hide" : "Show"}<span className="sr-only"> password</span></button></div>
        {mode === "sign-up" && !fieldErrors.password && (
          <p className="text-xs text-muted-foreground">At least {PASSWORD_MIN_LENGTH} characters.</p>
        )}
        {errorText("password")}
      </div>

      <Button type="submit" size="lg" className="min-h-11 w-full" disabled={pending}>
        {pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
      </Button>
    </form>
  );
}
