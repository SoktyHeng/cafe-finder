import { getServerEnv } from "@/lib/config/server-env";
import { getPlacesProvider } from "@/lib/places/get-provider";
import { getPlacesGuards } from "@/lib/security/guards";

import { createPlacePhotoHandler } from "./handler";

export const GET = createPlacePhotoHandler({
  getEnv: getServerEnv,
  getProvider: getPlacesProvider,
  guard: () => getPlacesGuards(getServerEnv()).photos,
});
