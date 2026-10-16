import { MapPinOff } from "lucide-react";

export type MapUnavailableReason = "not-configured" | "failed";

const COPY: Record<MapUnavailableReason, { title: string; body: string }> = {
  "not-configured": {
    title: "Map not available",
    body: "The map isn't set up on this site yet. All results are still listed.",
  },
  failed: {
    title: "The map couldn't load",
    body: "Google Maps didn't load. All results are still listed, and directions still work.",
  },
};

export function MapUnavailable({ reason }: { reason: MapUnavailableReason }) {
  const { title, body } = COPY[reason];
  return (
    <div
      data-testid="map-unavailable"
      data-reason={reason}
      className="flex h-full min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/40 p-6 text-center"
    >
      <MapPinOff aria-hidden="true" className="size-6 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
