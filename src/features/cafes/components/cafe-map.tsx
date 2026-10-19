"use client";

import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMap,
} from "@vis.gl/react-google-maps";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Coordinates } from "@/lib/geo/distance";

import { boundsFor } from "../map-geometry";
import { MapUnavailable } from "./map-unavailable";

export type MapMarker = Coordinates & {
  placeId: string;
  rank: number;
  name: string;
};

export type CafeMapProps = {
  /** Browser key: referrer-restricted, Maps JavaScript API only. */
  apiKey: string;
  /** Required for Advanced Markers. */
  mapId: string;
  origin: Coordinates & { label: string };
  markers: readonly MapMarker[];
  selectedPlaceId: string | null;
  onSelect: (placeId: string) => void;
};

const DEFAULT_ZOOM = 14;
const FIT_PADDING_PX = 48;
const PIN = {
  // Coffee palette; white glyphs on these fills pass 4.5:1 contrast.
  default: { background: "#7a4a2a", border: "#4a2c18" },
  selected: { background: "#2b1a0f", border: "#000000" },
  origin: { background: "#1d4ed8", border: "#1e3a8a" },
} as const;

/**
 * Google Map with numbered, keyboard-accessible markers. The map is created
 * once; selection changes only pan it and restyle markers. Google's own
 * logo, attribution and controls are left untouched.
 */
export function CafeMap(props: CafeMapProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  if (loadFailed) {
    return <MapUnavailable reason="failed" />;
  }
  return (
    <MapErrorBoundary>
      <APIProvider apiKey={props.apiKey} language="en" onError={() => setLoadFailed(true)}>
        <CafeMapContent {...props} />
      </APIProvider>
    </MapErrorBoundary>
  );
}

/**
 * Contains exceptions thrown by Google's map code (e.g. marker creation after a
 * rejected key, which reports `RefererNotAllowedMapError` asynchronously) so a
 * broken map never takes down the results list.
 */
class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <MapUnavailable reason="failed" /> : this.props.children;
  }
}

function CafeMapContent({ mapId, origin, markers, selectedPlaceId, onSelect }: CafeMapProps) {
  const status = useApiLoadingStatus();
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return <MapUnavailable reason="failed" />;
  }

  return (
    <div className="relative h-full w-full" data-testid="cafe-map">
      {status !== APILoadingStatus.LOADED && (
        <Skeleton aria-hidden="true" className="absolute inset-0 z-10 rounded-none" />
      )}
      <GoogleMap
        mapId={mapId}
        defaultCenter={{ lat: origin.latitude, lng: origin.longitude }}
        defaultZoom={DEFAULT_ZOOM}
        gestureHandling="cooperative"
        clickableIcons={false}
        className="h-full w-full"
      >
        <AdvancedMarker
          position={{ lat: origin.latitude, lng: origin.longitude }}
          title={`Search centre: ${origin.label}`}
          zIndex={0}
        >
          <Pin background={PIN.origin.background} borderColor={PIN.origin.border} glyphColor="#ffffff" scale={0.8} />
        </AdvancedMarker>
        {markers.map((marker) => {
          const selected = marker.placeId === selectedPlaceId;
          const colors = selected ? PIN.selected : PIN.default;
          return (
            <AdvancedMarker
              key={marker.placeId}
              position={{ lat: marker.latitude, lng: marker.longitude }}
              title={`${marker.rank}. ${marker.name}`}
              clickable
              onClick={() => onSelect(marker.placeId)}
              zIndex={selected ? 1000 : markers.length - marker.rank + 1}
            >
              <Pin
                background={colors.background}
                borderColor={colors.border}
                glyphColor="#ffffff"
                glyphText={String(marker.rank)}
                scale={selected ? 1.3 : 1}
              />
            </AdvancedMarker>
          );
        })}
      </GoogleMap>
      <FitToResults origin={origin} markers={markers} />
      <PanToSelected markers={markers} selectedPlaceId={selectedPlaceId} />
    </div>
  );
}

/** Frames the origin and results once per result set (the parent remounts per search). */
function FitToResults({ origin, markers }: Pick<CafeMapProps, "origin" | "markers">) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!map || fitted.current) return;
    fitted.current = true;
    const bounds = boundsFor([origin, ...markers]);
    if (bounds) {
      map.fitBounds(bounds, FIT_PADDING_PX);
    }
  }, [map, origin, markers]);
  return null;
}

function PanToSelected({ markers, selectedPlaceId }: Pick<CafeMapProps, "markers" | "selectedPlaceId">) {
  const map = useMap();
  useEffect(() => {
    if (!map || !selectedPlaceId) return;
    const marker = markers.find((candidate) => candidate.placeId === selectedPlaceId);
    if (marker) {
      map.panTo({ lat: marker.latitude, lng: marker.longitude });
    }
  }, [map, markers, selectedPlaceId]);
  return null;
}
