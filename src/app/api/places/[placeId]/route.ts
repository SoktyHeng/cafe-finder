import { getServerEnv } from "@/lib/config/server-env";
import { getPlacesProvider } from "@/lib/places/get-provider";
import { getPlacesGuards } from "@/lib/security/guards";

import { createPlaceDetailsHandler } from "./handler";

const handlePlaceDetails = createPlaceDetailsHandler({
  getEnv: getServerEnv,
  getProvider: getPlacesProvider,
  guard: () => getPlacesGuards(getServerEnv()).details,
});

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/places/[placeId]">,
) {
  const { placeId } = await params;
  return handlePlaceDetails(request, placeId);
}
