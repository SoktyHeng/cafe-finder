"use client";

import { List, Map as MapIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CafeCard } from "@/features/cafes/components/cafe-card";
import type { MapMarker } from "@/features/cafes/components/cafe-map";
import { MapUnavailable } from "@/features/cafes/components/map-unavailable";
import { cafeCardDomId } from "@/features/cafes/map-geometry";
import { WIDE_LAYOUT_QUERY, useMediaQuery } from "@/hooks/use-media-query";
import type { Coordinates } from "@/lib/geo/distance";
import type { Recommendation } from "@/lib/recommendation/schemas";

/** The Maps JavaScript API (and its billable map load) only loads when the map is shown. */
const CafeMap = lazy(() =>
  import("@/features/cafes/components/cafe-map").then((module) => ({ default: module.CafeMap })),
);

export type MapConfig = { apiKey: string | undefined; mapId: string };

type ResultsWithMapProps = {
  recommendations: readonly Recommendation[];
  origin: Coordinates & { label: string };
  mapConfig: MapConfig;
  detailsHref: (placeId: string) => string;
};

type View = "list" | "map";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Ranked list plus Google Map with two-way selection. Wide screens show both
 * side by side; narrower screens are list-first with a List/Map toggle. The
 * parent remounts this per search, which resets selection and map framing.
 */
export function ResultsWithMap({ recommendations, origin, mapConfig, detailsHref }: ResultsWithMapProps) {
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const [view, setView] = useState<View>("list");
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  // Once shown, the map stays mounted (hidden) so toggling doesn't reload it.
  const [mapRequested, setMapRequested] = useState(false);

  const showMap = isWide || view === "map";
  const showList = isWide || view === "list";
  const mapMounted = mapRequested || showMap;

  const markers: MapMarker[] = recommendations.flatMap(({ cafe }, index) =>
    cafe.latitude !== undefined && cafe.longitude !== undefined
      ? [{ placeId: cafe.placeId, rank: index + 1, name: cafe.name ?? "Unnamed cafe", latitude: cafe.latitude, longitude: cafe.longitude }]
      : [],
  );
  const selected = recommendations.find((item) => item.cafe.placeId === selectedPlaceId);
  const selectedRank = selected ? recommendations.indexOf(selected) + 1 : 0;
  const mappable = new Set(markers.map((marker) => marker.placeId));

  const switchView = (next: View) => {
    setView(next);
    if (next === "map") setMapRequested(true);
  };

  const revealCard = (placeId: string) => {
    requestAnimationFrame(() => {
      const card = document.getElementById(cafeCardDomId(placeId));
      card?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
      card?.focus({ preventScroll: true });
    });
  };

  const selectFromMap = (placeId: string) => {
    setSelectedPlaceId(placeId);
    revealCard(placeId);
  };

  const showOnMap = (placeId: string) => {
    setSelectedPlaceId(placeId);
    setMapRequested(true);
    if (!isWide) setView("map");
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Results view" className="flex gap-2 xl:hidden">
        <Button
          type="button"
          size="lg"
          variant={view === "list" ? "default" : "outline"}
          className="min-h-11 flex-1"
          aria-pressed={view === "list"}
          onClick={() => switchView("list")}
        >
          <List aria-hidden="true" />
          List
        </Button>
        <Button
          type="button"
          size="lg"
          variant={view === "map" ? "default" : "outline"}
          className="min-h-11 flex-1"
          aria-pressed={view === "map"}
          onClick={() => switchView("map")}
        >
          <MapIcon aria-hidden="true" />
          Map
        </Button>
      </div>

      <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start xl:gap-4">
        <ol aria-label="Cafes, best match first" hidden={!showList} className="flex flex-col gap-3">
          {recommendations.map((recommendation, index) => (
            <li key={recommendation.cafe.placeId}>
              <CafeCard
                recommendation={recommendation}
                rank={index + 1}
                detailsHref={detailsHref(recommendation.cafe.placeId)}
                selected={recommendation.cafe.placeId === selectedPlaceId}
                onShowOnMap={
                  mappable.has(recommendation.cafe.placeId)
                    ? () => showOnMap(recommendation.cafe.placeId)
                    : undefined
                }
              />
            </li>
          ))}
        </ol>

        {mapMounted && (
          <section
            aria-label="Map of results"
            hidden={!showMap}
            className="h-[60vh] min-h-72 overflow-hidden rounded-xl border xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]"
          >
            {mapConfig.apiKey ? (
              <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                <CafeMap
                  apiKey={mapConfig.apiKey}
                  mapId={mapConfig.mapId}
                  origin={origin}
                  markers={markers}
                  selectedPlaceId={selectedPlaceId}
                  onSelect={selectFromMap}
                />
              </Suspense>
            ) : (
              <MapUnavailable reason="not-configured" />
            )}
          </section>
        )}

        {!isWide && view === "map" && selected && (
          <div aria-label="Selected cafe" role="region">
            <CafeCard
              recommendation={selected}
              rank={selectedRank}
              detailsHref={detailsHref(selected.cafe.placeId)}
              selected
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}
