import { assistantRequestSchema, intentSchema, type AssistantResponse } from "@/lib/ai/schemas";
import type { IntentProvider } from "@/lib/ai/provider";
import { AIUnavailableError } from "@/lib/ai/provider";
import { resolveIntent } from "@/lib/ai/resolve-intent";
import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import { nearbySearchResponseSchema } from "@/lib/discovery/response-schema";
import { isSameOrigin, privateJson, validate } from "@/lib/http/route-helpers";
import { apiError } from "@/lib/security/api-error";
import type { RequestGuard } from "@/lib/security/request-guard";
import { DEFAULT_PREFERENCES, type Preferences } from "@/lib/user-data/schemas";

export const MAX_ASSISTANT_BODY_BYTES = 12_000;
/** Stop reading at the byte cap, even when Content-Length is absent or forged. */
async function readAssistantInput(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false as const, response: apiError("VALIDATION_ERROR", "Expected a JSON request body.") };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false as const, response: apiError("VALIDATION_ERROR", "Expected a JSON request body.") };
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_ASSISTANT_BODY_BYTES) {
      await reader.cancel();
      return { ok: false as const, response: apiError("VALIDATION_ERROR", "Request body is too large.") };
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(buffer)); }
  catch { return { ok: false as const, response: apiError("VALIDATION_ERROR", "Request body is not valid JSON.") }; }
  return validate(raw, assistantRequestSchema);
}
export type AssistantDeps = {
  enabled: () => boolean;
  provider: () => IntentProvider;
  guard: RequestGuard;
  maxRadiusMeters: () => number;
  savedPreferences: () => Promise<Preferences | null>;
  search: (filters: DiscoveryRequest, request: Request) => Promise<Response>;
};

export function createAssistantHandler(deps: AssistantDeps) {
  return async (request: Request): Promise<Response> => {
    if (!deps.enabled()) return apiError("UPSTREAM_UNAVAILABLE", "AI search is turned off. Use the regular search filters.");
    if (!isSameOrigin(request)) return apiError("FORBIDDEN", "Cross-site requests are not allowed.");
    const limited = deps.guard(request);
    if (limited) return limited;
    try {
      const parsed = await readAssistantInput(request);
      if (!parsed.ok) return parsed.response;
      const input = parsed.value;
      const defaults = input.preferences ?? await deps.savedPreferences().catch(() => null) ?? DEFAULT_PREFERENCES;
      const provider = deps.provider();
      // Validate injected/provider output again before any billable Places request.
      const intent = intentSchema.parse(await provider.parse({ message: input.message, history: input.history, preferences: defaults }));
      const resolved = resolveIntent(intent, defaults, input.location, deps.maxRadiusMeters());
      const base = { ...resolved, provider: provider.source, results: null };
      if (intent.action === "unsupported") {
        return privateJson({ ...base, status: "unsupported", message: "I can help search for cafes using supported preferences. Use a location, purpose, distance, rating, open-now, budget, Wi-Fi or quietness preference." } satisfies AssistantResponse);
      }
      if (intent.action === "clarify" || intent.locationMode === "unsupported" || !resolved.filters) {
        return privateJson({ ...base, status: "clarify", message: intent.action === "clarify"
          ? "Please clarify your cafe search using a supported area, radius of 1–15 km, purpose or preference. You can also use the regular filters."
          : "Choose a supported Phnom Penh area, or use the location button to search near you. I won't guess your location." } satisfies AssistantResponse);
      }
      const response = await deps.search(resolved.filters, request);
      if (!response.ok) return response;
      const results = nearbySearchResponseSchema.parse(await response.json());
      const message = results.results.length
        ? `Found ${results.results.length} nearby matches. Each card explains the evidence, unknown preferences and confidence. This is a subset of nearby cafes, not an exhaustive list.`
        : "No matches were found with these settings. Try a wider radius, remove the minimum rating, or include cafes with closed opening status.";
      return privateJson({ ...base, status: "ready", message, results } satisfies AssistantResponse);
    } catch (error) {
      if (error instanceof AIUnavailableError && error.reason === "budget") return apiError("RATE_LIMITED", "Today's AI allowance is used up. Use the regular search filters.", { "Retry-After": "86400" });
      return apiError("UPSTREAM_UNAVAILABLE", "AI search is temporarily unavailable. Use the regular search filters or try again later.");
    }
  };
}
