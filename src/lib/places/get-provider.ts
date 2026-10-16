import "server-only";

import type { ServerEnv } from "@/lib/config/env-schema";
import { GooglePlacesClient } from "@/lib/google/places-client";

import { FixturePlacesProvider } from "./fixture-provider";
import { GooglePlacesProvider } from "./google-provider";
import { PlacesProviderUnavailableError, type PlacesProvider } from "./provider";

export type ProviderEnv = Pick<ServerEnv, "PLACES_PROVIDER" | "GOOGLE_PLACES_SERVER_API_KEY">;

let cachedGoogleProvider: { apiKey: string; provider: GooglePlacesProvider } | undefined;

export function getPlacesProvider(env: ProviderEnv): PlacesProvider {
  switch (env.PLACES_PROVIDER) {
    case "fixture":
      return new FixturePlacesProvider();
    case "google": {
      const apiKey = env.GOOGLE_PLACES_SERVER_API_KEY;
      if (!apiKey) {
        // Env validation normally prevents this; fail closed if it doesn't.
        throw new PlacesProviderUnavailableError("google:missing_key");
      }
      if (cachedGoogleProvider?.apiKey !== apiKey) {
        cachedGoogleProvider = {
          apiKey,
          provider: new GooglePlacesProvider(new GooglePlacesClient({ apiKey })),
        };
      }
      return cachedGoogleProvider.provider;
    }
  }
}
