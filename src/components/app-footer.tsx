import Link from "next/link";

import type { PlacesProviderName } from "@/lib/config/env-schema";

type AppFooterProps = {
  placesProvider: PlacesProviderName;
};

export function AppFooter({ placesProvider }: AppFooterProps) {
  return (
    <footer className="mt-auto border-t bg-secondary/50">
      <div className="site-container flex flex-col gap-4 py-8 text-sm text-muted-foreground sm:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/" className="text-base font-semibold tracking-tight text-foreground">Cafe Finder.</Link><p className="mt-1 text-sm">Good coffee. Your kind of place.</p></div><Link href="/discover" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Explore cafes</Link></div>
        {placesProvider === "fixture" && (
          <p data-testid="fixture-mode-notice">
            <span className="font-medium text-foreground">Demo mode:</span>{" "}
            any cafe data shown is fictional fixture content, not live Google
            Maps results.
          </p>
        )}
        <p>
          Cafe Finder · Starting in Phnom Penh, Cambodia ·{" "}
          <Link href="/community-guidelines" className="underline underline-offset-2">
            Community guidelines
          </Link>
        </p>
      </div>
    </footer>
  );
}
