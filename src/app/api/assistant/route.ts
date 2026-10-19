import { getAIRuntime } from "@/lib/ai/runtime";
import { getServerEnv } from "@/lib/config/server-env";
import { getUserContext } from "@/lib/user-data/context";
import { POST as nearbySearch } from "@/app/api/places/nearby/route";
import { createAssistantHandler } from "./handler";

export const POST = createAssistantHandler({
  enabled: () => getServerEnv().ENABLE_AI,
  provider: () => getAIRuntime().provider,
  guard: (request) => getAIRuntime().guard(request),
  maxRadiusMeters: () => getServerEnv().MAX_SEARCH_RADIUS_METERS,
  savedPreferences: async () => {
    const context = await getUserContext();
    return context && context !== "unconfigured" ? context.store.getPreferences() : null;
  },
  search: (filters, request) => nearbySearch(new Request(new URL("/api/places/nearby", request.url), {
    method: "POST", headers: { "Content-Type": "application/json", ...Object.fromEntries(request.headers) }, body: JSON.stringify(filters),
  })),
});
