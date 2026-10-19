import { communityRoutes } from "@/lib/community/context";

type Context = RouteContext<"/api/community/[placeId]/review">;

export async function PUT(request: Request, { params }: Context) {
  return communityRoutes.saveReview(request, await params);
}

export async function DELETE(request: Request, { params }: Context) {
  return communityRoutes.deleteReview(request, await params);
}
