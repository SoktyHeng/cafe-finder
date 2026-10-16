"use client";

import { createBrowserClient } from "@supabase/ssr";

import { supabaseConfig } from "@/lib/config/env-schema";
import { getPublicEnv } from "@/lib/config/public-env";

import type { AppSupabaseClient } from "./types";

let client: AppSupabaseClient | null | undefined;

/**
 * Browser client, used only to observe sign-in state for the UI. Every
 * authorization decision happens on the server, where the JWT is verified.
 */
export function getSupabaseBrowserClient(): AppSupabaseClient | null {
  if (client === undefined) {
    const config = supabaseConfig(getPublicEnv());
    client = config ? createBrowserClient(config.url, config.key) : null;
  }
  return client;
}

export function isAuthConfigured(): boolean {
  return supabaseConfig(getPublicEnv()) !== null;
}
