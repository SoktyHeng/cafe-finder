"use client";

import { AlertCircle, ArrowLeft, Clock, ExternalLink, Globe, Navigation, Phone, Route, Star, Tag } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { GoogleMapsAttribution } from "@/components/google-maps-attribution";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formValuesToSearchParams, searchParamsToFormValues } from "@/features/discovery/url-state";
import { CommunitySection } from "@/features/community/components/community-section";
import { FavoriteButton, VisitedButton } from "@/features/favorites/components/save-buttons";
import { haversineMeters } from "@/lib/geo/distance";
import { directionsUrl } from "@/lib/google/maps-urls";
import type { ApiFailureCode } from "@/lib/http/request-api";
import type { PlaceDetailsResponse } from "@/lib/places/schemas";
import { cn } from "@/lib/utils";

import { usePlaceDetails } from "../details-client";
import { formatDistance, openStatus, priceLevelText, ratingText } from "../format";
import { AmenitiesList } from "./amenities-list";
import { OpeningHoursList } from "./opening-hours-list";
import { PhotoGallery } from "./photo-gallery";
import { ReviewsList } from "./reviews-list";

type BackLink = { href: string; label: string; origin?: { latitude: number; longitude: number; label: string } };

/**
 * Only a re-serialized, validated discovery query is used to link back, so
 * the `from` parameter can never produce an arbitrary URL.
 */
export function backLinkFrom(from: string | null): BackLink {
  if (from) {
    const parsed = searchParamsToFormValues(new URLSearchParams(from));
    if (parsed.status === "ready") {
      return {
        href: `/discover?${formValuesToSearchParams(parsed.values).toString()}`,
        label: "Back to results",
        origin: parsed.values.location,
      };
    }
  }
  return { href: "/discover", label: "Search for cafes" };
}

/** `/cafes/[placeId]`: details loaded on demand (one Place Details call per view). */
export function CafeDetailsView() {
  const { placeId } = useParams<{ placeId: string }>();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const back = useMemo(() => backLinkFrom(from), [from]);
  const { state, retry } = usePlaceDetails(placeId);

  return (
    <div className="page-shell flex max-w-6xl flex-col gap-6">
      <nav aria-label="Breadcrumb">
        <Link
          href={back.href}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {back.label}
        </Link>
      </nav>

      <p role="status" className="sr-only">
        {state.status === "loading" ? "Loading cafe details…" : ""}
      </p>

      {state.status === "idle" && <NotFound back={back} />}
      {state.status === "loading" && <DetailsSkeleton />}
      {state.status === "done" && !state.outcome.ok && (
        state.outcome.code === "NOT_FOUND" ? (
          <NotFound back={back} />
        ) : (
          <DetailsError code={state.outcome.code} onRetry={retry} />
        )
      )}
      {state.status === "done" && state.outcome.ok && <Details data={state.outcome.data} origin={back.origin} />}
    </div>
  );
}

export function DetailsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4" data-testid="details-skeleton">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="aspect-[4/3] w-full rounded-lg" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function NotFound({ back }: { back: BackLink }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find that cafe</h1>
      <p className="text-muted-foreground">It may have closed, or the link is incorrect.</p>
      <Button asChild size="lg" className="min-h-11 px-4">
        <Link href={back.href}>{back.label}</Link>
      </Button>
    </div>
  );
}

const ERROR_TEXT: Partial<Record<ApiFailureCode, string>> = {
  RATE_LIMITED: "Too many requests. Please wait a minute, then try again.",
  UPSTREAM_UNAVAILABLE: "Cafe details are temporarily unavailable. Please try again later.",
  NETWORK_ERROR: "Check your internet connection, then try again.",
};

function DetailsError({ code, onRetry }: { code: ApiFailureCode; onRetry: () => void }) {
  return (
    <>
      <h1 className="sr-only">Cafe details</h1>
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load this cafe</AlertTitle>
        <AlertDescription>
          <p>{ERROR_TEXT[code] ?? "Something went wrong. Please try again."}</p>
          <Button size="lg" className="mt-3 min-h-11 px-4" onClick={onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="details-section flex min-w-0 flex-col gap-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const OPEN_TONE_CLASS = {
  open: "text-emerald-800 dark:text-emerald-300",
  closed: "text-destructive",
  unknown: "text-muted-foreground",
} as const;

function Details({ data, origin }: { data: PlaceDetailsResponse; origin: BackLink["origin"] }) {
  const { place, source, attributions } = data;
  const name = place.name ?? "Unnamed cafe";
  const isGoogle = source === "google";
  const sourceName = isGoogle ? "Google" : "demo data";
  const open = openStatus(place);
  const directions = directionsUrl(place);
  const distance =
    origin && place.latitude !== undefined && place.longitude !== undefined
      ? haversineMeters(origin, { latitude: place.latitude, longitude: place.longitude })
      : undefined;

  return (
    <article aria-labelledby="cafe-name" className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:p-8">
        <p className="eyebrow">Your next coffee stop</p>
        <div className="flex flex-wrap gap-1.5 empty:hidden">
          {!isGoogle && <Badge variant="outline">Demo data</Badge>}
          {place.businessStatus === "closed_temporarily" && <Badge variant="destructive">Temporarily closed</Badge>}
          {place.businessStatus === "closed_permanently" && <Badge variant="destructive">Permanently closed</Badge>}
        </div>
        <h1 id="cafe-name" className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          {name}
        </h1>
        {place.address && <p className="text-muted-foreground">{place.address}</p>}
        <ul className="flex flex-wrap gap-x-6 gap-y-3 border-y py-4 text-sm">
          <li className="flex items-center gap-2">
            <Star aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className={cn(place.rating === undefined && "text-muted-foreground")}>{ratingText(place)}</span>
          </li>
          {distance !== undefined && origin && (
            <li className="flex items-center gap-2">
              <Navigation aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <span>
                {formatDistance(distance)} from {origin.label} (straight line)
              </span>
            </li>
          )}
          <li className="flex items-center gap-2">
            <Clock aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className={OPEN_TONE_CLASS[open.tone]}>{open.label}</span>
          </li>
          {place.priceLevel && (
            <li className="flex items-center gap-2">
              <Tag aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <span>{priceLevelText(place.priceLevel)} (not exact menu prices)</span>
            </li>
          )}
        </ul>
        {isGoogle && <GoogleMapsAttribution providers={attributions} />}
        {!isGoogle && (
          <p className="text-sm font-medium" data-testid="demo-details-notice">
            Demo mode: this cafe is fictional. Photos, reviews, amenities and directions aren&apos;t available.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {directions && (
            <Button asChild size="lg" className="min-h-11 px-4">
              <a href={directions} target="_blank" rel="noopener noreferrer">
                <Route aria-hidden="true" />
                Directions
                <span className="sr-only">(opens Google Maps in a new tab)</span>
              </a>
            </Button>
          )}
          {place.googleMapsUri && (
            <Button asChild size="lg" variant="outline" className="min-h-11 px-4">
              <a href={place.googleMapsUri} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                Open in Google Maps
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          )}
          {place.websiteUri && (
            <Button asChild size="lg" variant="outline" className="min-h-11 px-4">
              <a href={place.websiteUri} target="_blank" rel="noopener noreferrer nofollow">
                <Globe aria-hidden="true" />
                Website
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          )}
          <FavoriteButton placeId={place.placeId} placeName={name} className="border" />
          <VisitedButton placeId={place.placeId} placeName={name} />
          {place.phoneNumber && (
            <Button asChild size="lg" variant="outline" className="min-h-11 px-4">
              <a href={`tel:${place.phoneNumber.replace(/[^\d+]/g, "")}`}>
                <Phone aria-hidden="true" />
                {place.phoneNumber}
              </a>
            </Button>
          )}
        </div>
      </header>

      {isGoogle && (
        <Section title="Photos">
          <PhotoGallery photos={place.photos} placeName={name} />
        </Section>
      )}

      <nav aria-label="Cafe sections" className="flex flex-wrap gap-2 border-b pb-3 text-sm font-medium"><a className="inline-flex min-h-11 items-center rounded-full bg-secondary px-4" href="#cafe-information">Cafe information</a><a className="inline-flex min-h-11 items-center rounded-full px-4 hover:bg-secondary" href="#cafe-community">Member insights</a>{isGoogle && <a className="inline-flex min-h-11 items-center rounded-full px-4 hover:bg-secondary" href="#cafe-reviews">Google reviews</a>}</nav>
      <div id="cafe-information" className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <aside className="lg:order-2 lg:sticky lg:top-6">
      <Section title="Opening hours">
        <OpeningHoursList
          weekdayDescriptions={place.weekdayDescriptions}
          utcOffsetMinutes={place.utcOffsetMinutes}
          sourceName={sourceName}
        />
      </Section>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
      <Section title={isGoogle ? "Amenities from Google" : "Amenities"}>
        <AmenitiesList amenities={place.amenities} source={source} />
      </Section>

      <div id="cafe-community"><Section title="From Cafe Finder members">
        <CommunitySection placeId={place.placeId} placeName={name} />
      </Section></div>

      {isGoogle && (
        <div id="cafe-reviews"><Section title="Reviews from Google">
          <ReviewsList reviews={place.reviews} placeMapsUri={place.googleMapsUri} />
        </Section></div>
      )}
      </div></div>
    </article>
  );
}
