import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { AuthUnavailable } from "@/features/auth/components/auth-unavailable";
import { FavoritesView } from "@/features/favorites/components/favorites-view";
import { loginPath } from "@/lib/security/safe-redirect";
import { getUserContext } from "@/lib/user-data/context";
import { UserDataError, type UserDataStore } from "@/lib/user-data/store";
import { loadPlaceSummaries } from "@/lib/user-data/summaries";

export const metadata: Metadata = { title: "Your favorites" };

export default function FavoritesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <Suspense fallback={<FavoritesSkeleton />}>
        <FavoritesContent />
      </Suspense>
    </div>
  );
}

async function FavoritesContent() {
  // Per-user data: render only at request time. The Supabase client reads the
  // clock (token expiry), which Cache Components forbids during prerendering.
  await connection();
  const context = await getUserContext();
  if (context === "unconfigured") return <AuthUnavailable title="Favorites" />;
  // The proxy already redirects; this is the authoritative check.
  if (!context) redirect(loginPath("/favorites"));

  const data = await loadSaved(context.store).catch((error: unknown) => {
    if (error instanceof UserDataError) return null;
    throw error;
  });
  if (!data) {
    return (
      <p role="alert" className="text-destructive">
        Your saved cafes are temporarily unavailable. Please try again shortly.
      </p>
    );
  }
  const { summaries, degraded } = await loadPlaceSummaries(context.userId, [
    ...data.favorites.map((favorite) => favorite.placeId),
    ...data.visits.map((visit) => visit.placeId),
  ]);
  return <FavoritesView favorites={data.favorites} visits={data.visits} summaries={summaries} degraded={degraded} />;
}

async function loadSaved(store: UserDataStore) {
  const [favorites, visits] = await Promise.all([store.listFavorites(), store.listVisits()]);
  return { favorites, visits };
}

function FavoritesSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
