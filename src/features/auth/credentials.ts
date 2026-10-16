import { z } from "zod";

/** Supabase hashes with bcrypt, which ignores bytes beyond 72. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export const signInSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH),
});

export const signUpSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`),
  displayName: z.string().trim().max(80, "Use at most 80 characters.").optional(),
});

export type AuthFieldErrors = Partial<Record<"email" | "password" | "displayName", string>>;

export type AuthFormState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: AuthFieldErrors }
  | { status: "check-email"; email: string };

export const INITIAL_AUTH_STATE: AuthFormState = { status: "idle" };

export function fieldErrorsFrom(error: z.ZodError): AuthFieldErrors {
  const fieldErrors: AuthFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === "email" || field === "password" || field === "displayName") && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

/**
 * User-facing wording for Supabase Auth errors. Deliberately vague where
 * detail would reveal whether an account exists.
 */
export function authErrorMessage(error: { code?: string; status?: number; message?: string }): string {
  if (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (error.code === "email_not_confirmed") {
    return "Please confirm your email address first. Check your inbox for the link.";
  }
  if (error.code === "weak_password") {
    return "Choose a stronger password: longer, and not a common one.";
  }
  if (error.code === "signup_disabled" || error.code === "email_provider_disabled") {
    return "New sign-ups are currently disabled.";
  }
  if (error.code === "invalid_credentials" || error.status === 400) {
    return "Email or password is incorrect.";
  }
  return "Sign-in failed. Please try again.";
}
