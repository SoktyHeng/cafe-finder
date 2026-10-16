import { getServerEnv } from "@/lib/config/server-env";
import { getPlacesProvider } from "@/lib/places/get-provider";

import { createNearbySearchHandler } from "./handler";

export const POST = createNearbySearchHandler({
  getEnv: getServerEnv,
  getProvider: getPlacesProvider,
});
