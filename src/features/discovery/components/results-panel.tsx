"use client";

import { AlertCircle, SearchX } from "lucide-react";
import { useId } from "react";

import { GoogleMapsAttribution } from "@/components/google-maps-attribution";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CafeCard } from "@/features/cafes/components/cafe-card";
import { formatRadius } from "@/features/cafes/format";
import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import type { NearbySearchResponse } from "@/lib/discovery/response-schema";
import type { ExcludedCounts } from "@/lib/places/schemas";
import { suggestRelaxations, type RelaxationChange } from "@/lib/recommendation/relaxation";

import type { SearchErrorCode } from "../api-client";
import type { NearbySearchState } from "../hooks/use-nearby-search";

type ResultsPanelProps = {
  state: NearbySearchState;
  request: DiscoveryRequest | null;
  locationLabel: string | null;
  maxRadiusMeters: number;
  onRetry: () => void;
  onEditSearch: () => void;
  /** Runs a new, explicitly chosen search with one constraint loosened. */
  onRelax: (change: RelaxationChange) => void;
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
    return count === 0
      ? "No cafes found."
      : `${pluralize(count, "cafe", "cafes")} found, best match first.`;
  }
  return "";
}

export function ResultsPanel({
  state,
  request,
  locationLabel,
  maxRadiusMeters,
  onRetry,
  onEditSearch,
  onRelax,
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
          maxRadiusMeters={maxRadiusMeters}
          onEditSearch={onEditSearch}
          onRelax={onRelax}
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

function RelaxationOptions({
  request,
  data,
  maxRadiusMeters,
  onRelax,
}: {
  request: DiscoveryRequest;
  data: NearbySearchResponse;
  maxRadiusMeters: number;
  onRelax: (change: RelaxationChange) => void;
}) {
  const suggestions = suggestRelaxations(request, data.excluded, maxRadiusMeters);
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Try a wider search:</p>
      <ul className="flex flex-wrap gap-2" aria-label="Ways to widen your search">
        {suggestions.map((suggestion) => (
          <li key={suggestion.change.kind}>
            <Button
              size="lg"
              variant="outline"
              className="min-h-11 px-4"
              onClick={() => onRelax(suggestion.change)}
            >
              {suggestion.label}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Results({
  headingId,
  data,
  request,
  locationLabel,
  maxRadiusMeters,
  onEditSearch,
  onRelax,
}: {
  headingId: string;
  data: NearbySearchResponse;
  request: DiscoveryRequest;
  locationLabel: string;
  maxRadiusMeters: number;
  onEditSearch: () => void;
  onRelax: (change: RelaxationChange) => void;
}) {
  const exclusions = describeExclusions(data.excluded, request);
  const radius = formatRadius(request.radiusMeters);

  if (data.results.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <SearchX aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 id={headingId} className="text-lg font-semibold">
          No cafes found within {radius} of {locationLabel}
        </h2>
        {exclusions && <p className="text-sm">{exclusions}</p>}
        <RelaxationOptions
          request={request}
          data={data}
          maxRadiusMeters={maxRadiusMeters}
          onRelax={onRelax}
        />
        <Button size="lg" variant="ghost" className="min-h-11 px-4" onClick={onEditSearch}>
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
          Best match first, ranked by rating, distance, opening status
          {request.budget && request.budget !== "any" ? " and price level" : ""}.
          Things we can&apos;t verify count as neutral. {data.coverageNote}
        </p>
        {exclusions && <p className="text-sm text-muted-foreground">{exclusions}</p>}
        {data.source === "fixture" && (
          <p className="text-sm font-medium" data-testid="demo-results-notice">
            Demo mode: these cafes are fictional.
          </p>
        )}
        {data.source === "google" && (
          <>
            <p className="text-sm text-muted-foreground">
              Ratings, opening status and details come from Google. Hours can
              change, so confirm with the cafe.
            </p>
            <GoogleMapsAttribution providers={data.attributions} className="mt-1" />
          </>
        )}
      </div>
      <ol className="flex flex-col gap-3" aria-label="Cafes, best match first">
        {data.results.map((recommendation, index) => (
          <li key={recommendation.cafe.placeId}>
            <CafeCard recommendation={recommendation} rank={index + 1} />
          </li>
        ))}
      </ol>
    </>
  );
}
