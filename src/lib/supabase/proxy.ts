import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseConfig } from "@/lib/config/env-schema";
import { getPublicEnv } from "@/lib/config/public-env";
import { loginPath } from "@/lib/security/safe-redirect";

import type { Database } from "./database.types";

/** Pages that need a signed-in user. Pages and APIs re-check on the server. */
export const PROTECTED_PATH_PREFIXES = ["/favorites", "/account", "/moderation"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Refreshes the Supabase session on each request and writes rotated cookies
 * (plus the library's no-store headers) to the response. Also redirects
 * signed-out visitors away from protected pages. This is an optimistic
 * check only; the pages verify again.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const config = supabaseConfig(getPublicEnv());
  if (!config) {
    // Guest-only mode: protected pages explain that sign-in is unavailable.
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Responses that set auth cookies must not be cached (library-provided headers).
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Nothing may run between client creation and this call: it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && isProtectedPath(request.nextUrl.pathname)) {
    const redirect = NextResponse.redirect(
      new URL(loginPath(`${request.nextUrl.pathname}${request.nextUrl.search}`), request.url),
    );
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}
