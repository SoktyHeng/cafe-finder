import { communityRoutes } from "@/lib/community/context";

export async function GET(request: Request) {
  return communityRoutes.moderationQueue(request);
}

export async function POST(request: Request) {
  return communityRoutes.moderate(request);
}
