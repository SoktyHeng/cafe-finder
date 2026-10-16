import { describe, expect, it } from "vitest";

import { authErrorMessage, fieldErrorsFrom, signInSchema, signUpSchema } from "./credentials";

describe("credential validation", () => {
  it("requires a valid email and a non-empty password to sign in", () => {
    expect(signInSchema.safeParse({ email: "a@example.test", password: "x" }).success).toBe(true);
    const result = signInSchema.safeParse({ email: "nope", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsFrom(result.error)).toEqual({
        email: "Enter a valid email address.",
        password: "Enter your password.",
      });
    }
  });

  it("enforces password length on sign-up (8–72, bcrypt limit)", () => {
    const base = { email: "a@example.test" };
    expect(signUpSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "x".repeat(73) }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "long enough" }).success).toBe(true);
  });
});

describe("authErrorMessage", () => {
  it("never reveals whether an account exists", () => {
    expect(authErrorMessage({ code: "invalid_credentials", status: 400 })).toBe("Email or password is incorrect.");
    expect(authErrorMessage({ code: "user_not_found", status: 400 })).toBe("Email or password is incorrect.");
  });

  it.each([
    [{ status: 429 }, /too many attempts/i],
    [{ code: "email_not_confirmed", status: 400 }, /confirm your email/i],
    [{ code: "weak_password", status: 422 }, /stronger password/i],
    [{ code: "signup_disabled", status: 422 }, /disabled/i],
    [{ status: 500, message: "db exploded at 10.0.0.1" }, /^Sign-in failed/],
  ])("maps %o", (error, expected) => {
    const message = authErrorMessage(error);
    expect(message).toMatch(expected);
    expect(message).not.toContain("10.0.0.1");
  });
});
