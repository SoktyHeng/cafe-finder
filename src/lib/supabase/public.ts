import "server-only";

import { createClient } from "@supabase/supabase-js";

import { supabaseConfig } from "@/lib/config/env-schema";
import { getPublicEnv } from "@/lib/config/public-env";

import type { Database } from "./database.types";
import type { AppSupabaseClient } from "./types";

let client: AppSupabaseClient | null | undefined;

/**
 * Session-less client with the publishable key, acting as `anon`. Used only
 * for the anonymized public read functions (e.g. community summaries in
 * search). It can't read any table directly: `anon` has no table privileges.
 */
export function getPublicSupabaseClient(): AppSupabaseClient | null {
  if (client === undefined) {
    const config = supabaseConfig(getPublicEnv());
    client = config
      ? createClient<Database>(config.url, config.key, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : null;
  }
  return client;
}
