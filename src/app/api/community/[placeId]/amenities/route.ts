import { communityRoutes } from "@/lib/community/context";

type Context = RouteContext<"/api/community/[placeId]/amenities">;

export async function PUT(request: Request, { params }: Context) {
  return communityRoutes.submitAmenities(request, await params);
}

export async function DELETE(request: Request, { params }: Context) {
  return communityRoutes.removeAmenity(request, await params);
}
