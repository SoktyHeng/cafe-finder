import { loadCommunitySummaries } from "@/lib/community/context";
import { getServerEnv } from "@/lib/config/server-env";
import { getPlacesProvider } from "@/lib/places/get-provider";
import { getPlacesGuards } from "@/lib/security/guards";

import { createNearbySearchHandler } from "./handler";

export const POST = createNearbySearchHandler({
  getEnv: getServerEnv,
  getProvider: getPlacesProvider,
  guard: () => getPlacesGuards(getServerEnv()).nearby,
  getCommunity: loadCommunitySummaries,
});
