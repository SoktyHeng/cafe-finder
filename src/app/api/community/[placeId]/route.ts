import { communityRoutes } from "@/lib/community/context";

export async function GET(request: Request, { params }: RouteContext<"/api/community/[placeId]">) {
  return communityRoutes.place(request, (await params).placeId);
}
