import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { AuthUnavailable } from "@/features/auth/components/auth-unavailable";
import { ModerationView } from "@/features/community/components/moderation-view";
import { createSupabaseCommunityMemberStore } from "@/lib/community/supabase-store";
import { loginPath } from "@/lib/security/safe-redirect";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Moderation" };

export default function ModerationPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <ModerationContent />
      </Suspense>
    </div>
  );
}

async function ModerationContent() {
  await connection();
  const client = await createSupabaseServerClient();
  if (!client) return <AuthUnavailable title="Moderation" />;
  const user = await getVerifiedUser(client);
  if (!user) redirect(loginPath("/moderation"));

  // Authoritative check is in the database functions; this only decides what to render.
  const isModerator = await createSupabaseCommunityMemberStore(client).isModerator().catch(() => false);
  if (!isModerator) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
        <p className="text-muted-foreground">This page is only available to moderators.</p>
      </div>
    );
  }
  return <ModerationView />;
}
