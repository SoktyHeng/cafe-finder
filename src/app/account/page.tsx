import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { AccountView } from "@/features/auth/components/account-view";
import { AuthUnavailable } from "@/features/auth/components/auth-unavailable";
import { getServerEnv } from "@/lib/config/server-env";
import { loginPath } from "@/lib/security/safe-redirect";
import { getUserContext } from "@/lib/user-data/context";
import { UserDataError } from "@/lib/user-data/store";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:py-10">
      <Suspense
        fallback={
          <div aria-hidden="true" className="flex flex-col gap-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <AccountContent />
      </Suspense>
    </div>
  );
}

async function AccountContent() {
  // Per-user data: render only at request time. The Supabase client reads the
  // clock (token expiry), which Cache Components forbids during prerendering.
  await connection();
  const context = await getUserContext();
  if (context === "unconfigured") return <AuthUnavailable title="Your account" />;
  if (!context) redirect(loginPath("/account"));

  const data = await Promise.all([context.store.getProfile(), context.store.getPreferences()]).catch(
    (error: unknown) => {
      if (error instanceof UserDataError) return null;
      throw error;
    },
  );
  if (!data) {
    return (
      <p role="alert" className="text-destructive">
        Your account is temporarily unavailable. Please try again shortly.
      </p>
    );
  }
  const [profile, preferences] = data;
  return (
    <AccountView profile={profile} preferences={preferences} maxRadiusMeters={getServerEnv().MAX_SEARCH_RADIUS_METERS} />
  );
}
