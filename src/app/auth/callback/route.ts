import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/config/public-env";
import { logEvent } from "@/lib/observability/log";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** OAuth (Google) return URL: exchanges the PKCE code for a session cookie. */
export async function GET(request: NextRequest) {
  const appOrigin = getPublicEnv().NEXT_PUBLIC_APP_URL;
  const code = request.nextUrl.searchParams.get("code");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));

  const supabase = await createSupabaseServerClient();
  if (!supabase || !code) {
    return NextResponse.redirect(new URL("/login?error=oauth", appOrigin));
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logEvent("warn", "auth_oauth_exchange_failed", { code: error.code ?? "unknown" });
    return NextResponse.redirect(new URL("/login?error=oauth", appOrigin));
  }
  return NextResponse.redirect(new URL(next, appOrigin));
}
