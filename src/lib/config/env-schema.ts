import { z } from "zod";

/**
 * Pure environment schemas. No `process.env` access here so the parsing rules
 * can be unit tested with arbitrary inputs. Runtime accessors live in
 * `server-env.ts` (server only) and `public-env.ts` (browser safe).
 */

/** Values copied verbatim from `.env.example` must never count as configured. */
export const PLACEHOLDER_VALUE = "replace-me";

export const SEARCH_RADIUS_LIMITS = {
  minMeters: 1_000,
  maxMeters: 15_000,
} as const;

export const RATE_LIMIT_LIMITS = {
  minPerMinute: 1,
  maxPerMinute: 10_000,
  /** Per client: discovery searches (each may be one billable Nearby Search). */
  defaultDiscoveryPerMinute: 10,
  /** Per client: place details lookups. */
  defaultDetailsPerMinute: 30,
  /** Per client: photo media lookups. */
  defaultPhotosPerMinute: 60,
  /** Whole server instance: all Places requests combined. */
  defaultGlobalPerMinute: 120,
} as const;

export const PLACES_PROVIDERS = ["fixture", "google"] as const;
export type PlacesProviderName = (typeof PLACES_PROVIDERS)[number];

/** Empty strings and placeholders are treated as "not set". */
const optionalSecret = z
  .string()
  .trim()
  .optional()
  .transform((value) =>
    value === undefined || value === "" || value === PLACEHOLDER_VALUE
      ? undefined
      : value,
  );

/** Strict "true"/"false" flag; anything else is a configuration error. */
const booleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const integerInRange = (min: number, max: number, fallback: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, "must be a whole number")
    .default(String(fallback))
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));

export const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PLACES_PROVIDER: z.enum(PLACES_PROVIDERS).default("fixture"),
    GOOGLE_PLACES_SERVER_API_KEY: optionalSecret,
    GOOGLE_ROUTES_SERVER_API_KEY: optionalSecret,
    SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
    ENABLE_AI: booleanFlag,
    ENABLE_COMMUNITY_REPORTS: booleanFlag,
    MAX_SEARCH_RADIUS_METERS: integerInRange(
      SEARCH_RADIUS_LIMITS.minMeters,
      SEARCH_RADIUS_LIMITS.maxMeters,
      SEARCH_RADIUS_LIMITS.maxMeters,
    ),
    DISCOVERY_RATE_LIMIT_PER_MINUTE: integerInRange(
      RATE_LIMIT_LIMITS.minPerMinute,
      RATE_LIMIT_LIMITS.maxPerMinute,
      RATE_LIMIT_LIMITS.defaultDiscoveryPerMinute,
    ),
    PLACE_DETAILS_RATE_LIMIT_PER_MINUTE: integerInRange(
      RATE_LIMIT_LIMITS.minPerMinute,
      RATE_LIMIT_LIMITS.maxPerMinute,
      RATE_LIMIT_LIMITS.defaultDetailsPerMinute,
    ),
    PLACE_PHOTOS_RATE_LIMIT_PER_MINUTE: integerInRange(
      RATE_LIMIT_LIMITS.minPerMinute,
      RATE_LIMIT_LIMITS.maxPerMinute,
      RATE_LIMIT_LIMITS.defaultPhotosPerMinute,
    ),
    PLACES_GLOBAL_RATE_LIMIT_PER_MINUTE: integerInRange(
      RATE_LIMIT_LIMITS.minPerMinute,
      RATE_LIMIT_LIMITS.maxPerMinute,
      RATE_LIMIT_LIMITS.defaultGlobalPerMinute,
    ),
    /**
     * Use X-Forwarded-For / X-Real-IP to tell clients apart. Enable only behind
     * a proxy that overwrites these headers (e.g. Vercel); otherwise all
     * clients share one rate-limit bucket, which is safe but strict.
     */
    TRUST_PROXY: booleanFlag,
  })
  .superRefine((env, ctx) => {
    if (env.PLACES_PROVIDER === "google" && !env.GOOGLE_PLACES_SERVER_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_PLACES_SERVER_API_KEY"],
        message: 'is required when PLACES_PROVIDER is "google"',
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  /** Public by design; must be restricted by HTTP referrer and to the Maps JavaScript API. */
  NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: optionalSecret,
  /** Map ID (not a secret) required for Advanced Markers. */
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, "must be a Google Maps Map ID")
    .optional(),
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalSecret,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export type EnvSource = Record<string, string | undefined>;

export class EnvValidationError extends Error {
  readonly invalidVariables: readonly string[];

  constructor(invalidVariables: readonly string[], details: readonly string[]) {
    // Only variable names and rule descriptions — never the offending values,
    // which may be secrets.
    super(`Invalid environment configuration:\n${details.join("\n")}`);
    this.name = "EnvValidationError";
    this.invalidVariables = invalidVariables;
  }
}

function parseWith<T extends z.ZodType>(
  schema: T,
  source: EnvSource,
): z.infer<T> {
  // Treat empty strings as unset so `KEY=` in an env file falls back to defaults.
  const normalized = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  const result = schema.safeParse(normalized);
  if (result.success) {
    return result.data;
  }
  const names = result.error.issues.map((issue) => issue.path.join("."));
  const details = result.error.issues.map(
    (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
  );
  throw new EnvValidationError([...new Set(names)], details);
}

export function parseServerEnv(source: EnvSource): ServerEnv {
  return parseWith(serverEnvSchema, source);
}

export function parsePublicEnv(source: EnvSource): PublicEnv {
  return parseWith(publicEnvSchema, source);
}

/**
 * The browser key ships to every visitor. Reusing the unrestricted server key
 * there would expose Places Web Service access, so identical keys are refused.
 */
export function assertSeparateGoogleKeys(
  server: Pick<ServerEnv, "GOOGLE_PLACES_SERVER_API_KEY" | "GOOGLE_ROUTES_SERVER_API_KEY">,
  publicEnv: Pick<PublicEnv, "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY">,
): void {
  const browserKey = publicEnv.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (
    browserKey !== undefined &&
    (browserKey === server.GOOGLE_PLACES_SERVER_API_KEY ||
      browserKey === server.GOOGLE_ROUTES_SERVER_API_KEY)
  ) {
    throw new EnvValidationError(
      ["NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY"],
      ["  - NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: must be a separate, referrer-restricted key (it equals a server key)"],
    );
  }
}
