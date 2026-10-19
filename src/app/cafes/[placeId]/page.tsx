import type { Metadata } from "next";
import { Suspense } from "react";

import { CafeDetailsView, DetailsSkeleton } from "@/features/cafes/components/cafe-details-view";

// No server-side fetch here: a generateMetadata lookup would add a second
// billable Place Details call per view. The page title stays generic.
export const metadata: Metadata = {
  title: "Cafe details",
};

export default function CafeDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="page-shell max-w-6xl">
          <DetailsSkeleton />
        </div>
      }
    >
      <CafeDetailsView />
    </Suspense>
  );
}
