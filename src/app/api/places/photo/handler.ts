import type { ServerEnv } from "@/lib/config/env-schema";
import { logEvent } from "@/lib/observability/log";
import {
  PHOTO_WIDTHS,
  PlacesProviderUnavailableError,
  type PhotoWidth,
  type PlacesProvider,
} from "@/lib/places/provider";
import { PHOTO_NAME_PATTERN } from "@/lib/places/schemas";
import { UPSTREAM_UNAVAILABLE_MESSAGE, apiError } from "@/lib/security/api-error";
import type { RequestGuard } from "@/lib/security/request-guard";

type PhotoEnv = Pick<ServerEnv, "PLACES_PROVIDER" | "GOOGLE_PLACES_SERVER_API_KEY">;

export const DEFAULT_PHOTO_WIDTH: PhotoWidth = 400;

export type PlacePhotoHandlerDeps = {
  getEnv: () => PhotoEnv;
  getProvider: (env: PhotoEnv) => PlacesProvider;
  guard: (env: PhotoEnv) => RequestGuard;
};

function parseWidth(raw: string | null): PhotoWidth | undefined {
  if (raw === null) return DEFAULT_PHOTO_WIDTH;
  return PHOTO_WIDTHS.find((width) => String(width) === raw);
}

/**
 * `GET /api/places/photo?name=places/…/photos/…&maxWidthPx=400`
 *
 * Resolves a photo name server-side (so the API key never reaches the
 * browser) and redirects to Google's short-lived image URL. Only
 * pattern-validated photo names and allowlisted widths are accepted, and the
 * redirect target must be a Google photo host (no open redirect or SSRF).
 * Nothing is cached: photo names and URLs are ephemeral by policy.
 */
export function createPlacePhotoHandler({ getEnv, getProvider, guard }: PlacePhotoHandlerDeps) {
  return async function handlePlacePhoto(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const name = params.get("name");
    const width = parseWidth(params.get("maxWidthPx"));
    if (name === null || !PHOTO_NAME_PATTERN.test(name) || width === undefined) {
      return apiError("VALIDATION_ERROR", "Invalid photo request.");
    }

    try {
      const env = getEnv();
      const limited = guard(env)(request);
      if (limited) {
        return limited;
      }

      const url = await getProvider(env).getPhotoUrl(name, width);
      if (!url) {
        return apiError("NOT_FOUND", "This photo is no longer available.");
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: url,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    } catch (error) {
      if (error instanceof PlacesProviderUnavailableError) {
        logEvent("warn", "place_photo_unavailable", { reason: error.message });
        return apiError("UPSTREAM_UNAVAILABLE", UPSTREAM_UNAVAILABLE_MESSAGE);
      }
      logEvent("error", "place_photo_failed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
      return apiError("INTERNAL_ERROR", "Something went wrong. Please try again.");
    }
  };
}
