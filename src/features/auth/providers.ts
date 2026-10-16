import "server-only";

import { z } from "zod";

import type { SupabaseConfig } from "@/lib/config/env-schema";

/** Supabase's public auth settings (`GET /auth/v1/settings`): which sign-in methods are on. */
const settingsSchema = z.object({
  external: z.record(z.string(), z.boolean()).optional(),
  disable_signup: z.boolean().optional(),
});

export type AuthProviders = { google: boolean };

const CACHE_MS = 5 * 60_000;
const TIMEOUT_MS = 3_000;
let cached: { at: number; url: string; value: AuthProviders } | undefined;

/**
 * Enabled providers, cached briefly. On any failure it reports `google: true`,
 * so a settings outage never blocks sign-in; Supabase still has the final say.
 */
export async function getAuthProviders(
  config: SupabaseConfig,
  { fetchImpl = fetch, now = Date.now }: { fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<AuthProviders> {
  if (cached && cached.url === config.url && now() - cached.at < CACHE_MS) return cached.value;
  try {
    const response = await fetchImpl(new URL("/auth/v1/settings", config.url), {
      headers: { apikey: config.key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const parsed = settingsSchema.safeParse(response.ok ? await response.json() : null);
    if (!parsed.success) return { google: true };
    const value = { google: parsed.data.external?.google === true };
    cached = { at: now(), url: config.url, value };
    return value;
  } catch {
    return { google: true };
  }
}

export function resetAuthProvidersCache() {
  cached = undefined;
}
