import { communityRoutes } from "@/lib/community/context";

type Context = RouteContext<"/api/community/reviews/[reviewId]/vote">;

export async function PUT(request: Request, { params }: Context) {
  return communityRoutes.vote(request, await params);
}

export async function DELETE(request: Request, { params }: Context) {
  return communityRoutes.removeVote(request, await params);
}
