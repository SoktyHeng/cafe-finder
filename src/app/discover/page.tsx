import type { Metadata } from "next";
import { Suspense } from "react";

import { DiscoveryView } from "@/features/discovery/components/discovery-view";
import { ResultsSkeleton } from "@/features/discovery/components/results-panel";
import { getServerEnv } from "@/lib/config/server-env";

export const metadata: Metadata = {
  title: "Discover cafes",
};

export default function DiscoverPage() {
  const { MAX_SEARCH_RADIUS_METERS } = getServerEnv();

  return (
    // The view reads search params, so it renders on the client inside Suspense.
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
          <h1 className="mb-6 text-2xl font-semibold tracking-tight">Discover cafes</h1>
          <ResultsSkeleton />
        </div>
      }
    >
      <DiscoveryView maxRadiusMeters={MAX_SEARCH_RADIUS_METERS} />
    </Suspense>
  );
}
