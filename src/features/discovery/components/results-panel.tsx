"use client";

import { AlertCircle, SearchX } from "lucide-react";
import { useId } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CafeCard } from "@/features/cafes/components/cafe-card";
import { formatRadius } from "@/features/cafes/format";
import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import type { ExcludedCounts, NearbySearchResponse } from "@/lib/places/schemas";

import type { SearchErrorCode } from "../api-client";
import type { NearbySearchState } from "../hooks/use-nearby-search";
import { unverifiedPreferences } from "../unverified-preferences";

type ResultsPanelProps = {
  state: NearbySearchState;
  request: DiscoveryRequest | null;
  locationLabel: string | null;
  onRetry: () => void;
  onEditSearch: () => void;
};

const ERROR_COPY: Record<SearchErrorCode, { title: string; body: string; retry: boolean }> = {
  VALIDATION_ERROR: {
    title: "Some search settings are invalid",
    body: "Check your settings and search again.",
    retry: false,
  },
  RATE_LIMITED: {
    title: "Too many searches",
    body: "Please wait a minute, then try again.",
    retry: true,
  },
  UPSTREAM_UNAVAILABLE: {
    title: "Cafe search is temporarily unavailable",
    body: "Our cafe data provider is not responding. Please try again later.",
    retry: true,
  },
  NETWORK_ERROR: {
    title: "Can't reach Cafe Finder",
    body: "Check your internet connection, then try again.",
    retry: true,
  },
  AUTH_REQUIRED: { title: "Something went wrong", body: "Please try again.", retry: true },
  FORBIDDEN: { title: "Something went wrong", body: "Please try again.", retry: true },
  NOT_FOUND: { title: "Something went wrong", body: "Please try again.", retry: true },
  INTERNAL_ERROR: { title: "Something went wrong", body: "Please try again.", retry: true },
  INVALID_RESPONSE: { title: "Something went wrong", body: "Please try again.", retry: true },
};

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function describeExclusions(
  excluded: ExcludedCounts,
  request: Pick<DiscoveryRequest, "minRating">,
): string | null {
  const parts: string[] = [];
  if (excluded.belowMinRating > 0) {
    parts.push(
      `${pluralize(excluded.belowMinRating, "cafe", "cafes")} rated below ${request.minRating?.toFixed(1)}`,
    );
  }
  if (excluded.closedNow > 0) {
    parts.push(`${pluralize(excluded.closedNow, "cafe", "cafes")} closed now`);
  }
  if (excluded.permanentlyClosed > 0) {
    parts.push(
      `${pluralize(excluded.permanentlyClosed, "cafe", "cafes")} permanently closed`,
    );
  }
  return parts.length > 0 ? `Hidden by your filters: ${parts.join(", ")}.` : null;
}

function statusMessage(state: NearbySearchState): string {
  if (state.status === "loading") return "Searching for cafes…";
  if (state.status === "done" && state.outcome.ok) {
    const count = state.outcome.data.results.length;
    return count === 0 ? "No cafes found." : `${pluralize(count, "cafe", "cafes")} found.`;
  }
  return "";
}

export function ResultsPanel({
  state,
  request,
  locationLabel,
  onRetry,
  onEditSearch,
}: ResultsPanelProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-4">
      {/* One polite live region for state changes; errors use role="alert". */}
      <p role="status" className="sr-only">
        {statusMessage(state)}
      </p>

      {state.status === "idle" && (
        <>
          <h2 id={headingId} className="text-lg font-semibold">
            Results
          </h2>
          <p className="text-muted-foreground">
            Choose a location and press <strong>Find My Cafe</strong> to see
            cafes nearby.
          </p>
        </>
      )}

      {state.status === "loading" && (
        <>
          <h2 id={headingId} className="text-lg font-semibold">
            Searching…
          </h2>
          <ResultsSkeleton />
        </>
      )}

      {state.status === "done" && !state.outcome.ok && (
        <>
          <h2 id={headingId} className="sr-only">
            Search failed
          </h2>
          <ErrorState code={state.outcome.code} onRetry={onRetry} onEditSearch={onEditSearch} />
        </>
      )}

      {state.status === "done" && state.outcome.ok && request && (
        <Results
          headingId={headingId}
          data={state.outcome.data}
          request={request}
          locationLabel={locationLabel ?? "the selected location"}
          onEditSearch={onEditSearch}
        />
      )}
    </section>
  );
}

export function ResultsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3" data-testid="results-skeleton">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border p-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({
  code,
  onRetry,
  onEditSearch,
}: {
  code: SearchErrorCode;
  onRetry: () => void;
  onEditSearch: () => void;
}) {
  const copy = ERROR_COPY[code];
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        <p>{copy.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {copy.retry && (
            <Button size="lg" className="min-h-11 px-4" onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button size="lg" variant="outline" className="min-h-11 px-4" onClick={onEditSearch}>
            Edit search
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function Results({
  headingId,
  data,
  request,
  locationLabel,
  onEditSearch,
}: {
  headingId: string;
  data: NearbySearchResponse;
  request: DiscoveryRequest;
  locationLabel: string;
  onEditSearch: () => void;
}) {
  const exclusions = describeExclusions(data.excluded, request);
  const preferences = unverifiedPreferences(request);
  const radius = formatRadius(request.radiusMeters);

  if (data.results.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 id={headingId} className="text-lg font-semibold">
          No cafes found within {radius} of {locationLabel}
        </h2>
        {exclusions && <p className="text-sm">{exclusions}</p>}
        <p className="text-sm text-muted-foreground">
          Try a larger distance, a lower minimum rating, or turning off &ldquo;Open
          now only&rdquo;.
        </p>
        <Button size="lg" variant="outline" className="min-h-11 px-4" onClick={onEditSearch}>
          Edit search
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-lg font-semibold">
          {pluralize(data.results.length, "cafe", "cafes")} within {radius} of {locationLabel}
        </h2>
        <p className="text-sm text-muted-foreground">
          Nearest first. {data.coverageNote}
        </p>
        {exclusions && <p className="text-sm text-muted-foreground">{exclusions}</p>}
        {data.source === "fixture" && (
          <p className="text-sm font-medium" data-testid="demo-results-notice">
            Demo mode: these cafes are fictional.
          </p>
        )}
      </div>
      <ol className="flex flex-col gap-3" aria-label="Cafes">
        {data.results.map((cafe) => (
          <li key={cafe.placeId}>
            <CafeCard cafe={cafe} unverifiedPreferences={preferences} />
          </li>
        ))}
      </ol>
    </>
  );
}
