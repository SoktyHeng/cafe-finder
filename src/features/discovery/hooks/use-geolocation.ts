"use client";

import { useCallback, useState } from "react";

export type GeolocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported";

export type DevicePosition = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
};

/** GeolocationPositionError codes (W3C Geolocation API). */
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

/**
 * Coarse, one-shot position: no high-accuracy GPS, no watching, and cached
 * positions up to five minutes old are acceptable.
 */
const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 5 * 60_000,
};

/**
 * Asks for the device position only when `request` is called, which must
 * come from a user action. Nothing runs on mount and nothing is stored.
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeolocationStatus>("idle");

  const request = useCallback((onPosition: (position: DevicePosition) => void) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setStatus("granted");
        onPosition({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracyMeters: Number.isFinite(coords.accuracy) ? coords.accuracy : undefined,
        });
      },
      (error) => {
        setStatus(
          error.code === PERMISSION_DENIED
            ? "denied"
            : error.code === TIMEOUT
              ? "timeout"
              : "unavailable",
        );
      },
      POSITION_OPTIONS,
    );
  }, []);

  return { status, request };
}
