import { parsePublicEnv, type PublicEnv } from "./env-schema";

let cached: PublicEnv | undefined;

/**
 * Browser-safe configuration. Each variable is referenced statically so
 * Next.js can inline it into client bundles; dynamic lookups are not inlined.
 */
export function getPublicEnv(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY,
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return cached;
}
