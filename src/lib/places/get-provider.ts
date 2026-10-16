import "server-only";

import type { ServerEnv } from "@/lib/config/env-schema";

import { FixturePlacesProvider } from "./fixture-provider";
import { PlacesProviderUnavailableError, type PlacesProvider } from "./provider";

export function getPlacesProvider(
  env: Pick<ServerEnv, "PLACES_PROVIDER">,
): PlacesProvider {
  switch (env.PLACES_PROVIDER) {
    case "fixture":
      return new FixturePlacesProvider();
    case "google":
      // The live Google Places adapter is built in M2.
      throw new PlacesProviderUnavailableError(
        "The Google Places provider is not implemented yet.",
      );
  }
}
