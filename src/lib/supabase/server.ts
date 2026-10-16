import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseConfig } from "@/lib/config/env-schema";
import { getPublicEnv } from "@/lib/config/public-env";

import type { Database } from "./database.types";
import type { AppSupabaseClient } from "./types";

export type { AppSupabaseClient };

export type VerifiedUser = { id: string; email: string | undefined };

/**
 * Request-scoped Supabase client acting as the signed-in user (RLS applies).
 * `null` when Supabase isn't configured. Create one per request: the library
 * attaches no-cache headers only on its first cookie write.
 */
export async function createSupabaseServerClient(): Promise<AppSupabaseClient | null> {
  const config = supabaseConfig(getPublicEnv());
  if (!config) return null;
  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. The proxy refreshes the
          // session on every request, so this write isn't needed here.
        }
      },
    },
  });
}

/**
 * The signed-in user, verified by checking the JWT's signature and expiry
 * (`getClaims`), never by trusting the cookie contents (`getSession`).
 */
export async function getVerifiedUser(
  client: AppSupabaseClient | null,
): Promise<VerifiedUser | null> {
  if (!client) return null;
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub || claims.is_anonymous) return null;
  return { id: claims.sub, email: claims.email };
}
