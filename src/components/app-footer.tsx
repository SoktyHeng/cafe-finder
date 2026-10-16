import type { PlacesProviderName } from "@/lib/config/env-schema";

type AppFooterProps = {
  placesProvider: PlacesProviderName;
};

export function AppFooter({ placesProvider }: AppFooterProps) {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        {placesProvider === "fixture" && (
          <p data-testid="fixture-mode-notice">
            <span className="font-medium text-foreground">Demo mode:</span>{" "}
            any cafe data shown is fictional fixture content, not live Google
            Maps results.
          </p>
        )}
        <p>Cafe Finder · Starting in Phnom Penh, Cambodia.</p>
      </div>
    </footer>
  );
}
