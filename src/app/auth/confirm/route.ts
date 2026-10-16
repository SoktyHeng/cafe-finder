import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/config/public-env";
import { logEvent } from "@/lib/observability/log";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ["signup", "email", "email_change", "invite", "magiclink"];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Email confirmation link target. Uses `token_hash`, so the link works in any
 * browser (no PKCE verifier needed). Configure the Supabase "Confirm signup"
 * email template to link to
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}
 */
export async function GET(request: NextRequest) {
  const appOrigin = getPublicEnv().NEXT_PUBLIC_APP_URL;
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"));

  const supabase = await createSupabaseServerClient();
  if (!supabase || !tokenHash || !isEmailOtpType(type)) {
    return NextResponse.redirect(new URL("/login?error=confirm", appOrigin));
  }
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    logEvent("warn", "auth_confirm_failed", { code: error.code ?? "unknown" });
    return NextResponse.redirect(new URL("/login?error=confirm", appOrigin));
  }
  return NextResponse.redirect(new URL(next, appOrigin));
}
