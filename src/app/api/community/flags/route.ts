import { communityRoutes } from "@/lib/community/context";

export async function POST(request: Request) {
  return communityRoutes.flag(request);
}
