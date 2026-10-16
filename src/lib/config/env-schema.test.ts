import { describe, expect, it } from "vitest";

import {
  EnvValidationError,
  PLACEHOLDER_VALUE,
  parsePublicEnv,
  parseServerEnv,
} from "./env-schema";

function expectEnvError(fn: () => unknown): EnvValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected EnvValidationError to be thrown");
}

describe("parseServerEnv", () => {
  it("defaults to fixture mode with no keys configured", () => {
    expect(parseServerEnv({})).toEqual({
      NODE_ENV: "development",
      PLACES_PROVIDER: "fixture",
      GOOGLE_PLACES_SERVER_API_KEY: undefined,
      GOOGLE_ROUTES_SERVER_API_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      ENABLE_AI: false,
      ENABLE_COMMUNITY_REPORTS: false,
      MAX_SEARCH_RADIUS_METERS: 15_000,
      DISCOVERY_RATE_LIMIT_PER_MINUTE: 10,
      PLACE_DETAILS_RATE_LIMIT_PER_MINUTE: 30,
      PLACE_PHOTOS_RATE_LIMIT_PER_MINUTE: 60,
      PLACES_GLOBAL_RATE_LIMIT_PER_MINUTE: 120,
      TRUST_PROXY: false,
    });
  });

  it("accepts the unedited .env.example placeholders in fixture mode", () => {
    const env = parseServerEnv({
      PLACES_PROVIDER: "fixture",
      GOOGLE_PLACES_SERVER_API_KEY: PLACEHOLDER_VALUE,
      SUPABASE_SERVICE_ROLE_KEY: PLACEHOLDER_VALUE,
    });

    expect(env.GOOGLE_PLACES_SERVER_API_KEY).toBeUndefined();
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });

  it("treats empty strings as unset", () => {
    const env = parseServerEnv({
      PLACES_PROVIDER: "",
      MAX_SEARCH_RADIUS_METERS: "",
      ENABLE_AI: "",
    });

    expect(env.PLACES_PROVIDER).toBe("fixture");
    expect(env.MAX_SEARCH_RADIUS_METERS).toBe(15_000);
    expect(env.ENABLE_AI).toBe(false);
  });

  it("requires a real Places server key in google mode", () => {
    const error = expectEnvError(() =>
      parseServerEnv({ PLACES_PROVIDER: "google" }),
    );
    expect(error.invalidVariables).toEqual(["GOOGLE_PLACES_SERVER_API_KEY"]);

    expectEnvError(() =>
      parseServerEnv({
        PLACES_PROVIDER: "google",
        GOOGLE_PLACES_SERVER_API_KEY: PLACEHOLDER_VALUE,
      }),
    );
  });

  it("accepts google mode when a key is provided", () => {
    const env = parseServerEnv({
      PLACES_PROVIDER: "google",
      GOOGLE_PLACES_SERVER_API_KEY: "test-key-not-real",
    });

    expect(env.PLACES_PROVIDER).toBe("google");
    expect(env.GOOGLE_PLACES_SERVER_API_KEY).toBe("test-key-not-real");
  });

  it("rejects unknown providers", () => {
    const error = expectEnvError(() =>
      parseServerEnv({ PLACES_PROVIDER: "scraper" }),
    );
    expect(error.invalidVariables).toEqual(["PLACES_PROVIDER"]);
  });

  it.each([
    ["999", false],
    ["1000", true],
    ["15000", true],
    ["15001", false],
    ["3.5", false],
    ["-1", false],
    ["abc", false],
  ])("MAX_SEARCH_RADIUS_METERS=%s valid=%s", (value, valid) => {
    const parse = () => parseServerEnv({ MAX_SEARCH_RADIUS_METERS: value });
    if (valid) {
      expect(parse().MAX_SEARCH_RADIUS_METERS).toBe(Number(value));
    } else {
      expect(expectEnvError(parse).invalidVariables).toEqual([
        "MAX_SEARCH_RADIUS_METERS",
      ]);
    }
  });

  it.each([
    ["0", false],
    ["1", true],
    ["10000", true],
    ["10001", false],
  ])("DISCOVERY_RATE_LIMIT_PER_MINUTE=%s valid=%s", (value, valid) => {
    const parse = () =>
      parseServerEnv({ DISCOVERY_RATE_LIMIT_PER_MINUTE: value });
    if (valid) {
      expect(parse().DISCOVERY_RATE_LIMIT_PER_MINUTE).toBe(Number(value));
    } else {
      expectEnvError(parse);
    }
  });

  it("parses boolean flags strictly", () => {
    expect(parseServerEnv({ ENABLE_AI: "true" }).ENABLE_AI).toBe(true);
    expect(parseServerEnv({ ENABLE_AI: "false" }).ENABLE_AI).toBe(false);
    expectEnvError(() => parseServerEnv({ ENABLE_AI: "yes" }));
    expectEnvError(() => parseServerEnv({ ENABLE_COMMUNITY_REPORTS: "1" }));
  });

  it("never includes variable values in error messages", () => {
    const secretLookingValue = "sk-super-secret-value-123";
    const error = expectEnvError(() =>
      parseServerEnv({
        PLACES_PROVIDER: secretLookingValue,
        MAX_SEARCH_RADIUS_METERS: secretLookingValue,
        ENABLE_AI: secretLookingValue,
      }),
    );

    expect(error.message).not.toContain(secretLookingValue);
    expect(error.invalidVariables).toEqual(
      expect.arrayContaining([
        "PLACES_PROVIDER",
        "MAX_SEARCH_RADIUS_METERS",
        "ENABLE_AI",
      ]),
    );
  });
});

describe("parsePublicEnv", () => {
  it("works with nothing configured", () => {
    expect(parsePublicEnv({})).toEqual({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: undefined,
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
    });
  });

  it("treats placeholders as unset", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: PLACEHOLDER_VALUE,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: PLACEHOLDER_VALUE,
    });

    expect(env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeUndefined();
  });

  it("validates URLs", () => {
    expectEnvError(() => parsePublicEnv({ NEXT_PUBLIC_APP_URL: "not a url" }));
    expectEnvError(() =>
      parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "not a url" }),
    );
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }).NEXT_PUBLIC_SUPABASE_URL,
    ).toBe("https://example.supabase.co");
  });
});
