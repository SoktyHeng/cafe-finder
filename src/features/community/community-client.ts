import { z } from "zod";

import { useKeyedRequest } from "@/hooks/use-keyed-request";
import { requestApi, type ApiOutcome } from "@/lib/http/request-api";
import {
  communityPlaceResponseSchema,
  type AmenityReportInput,
  type CommunityAmenity,
  type CommunityPlaceResponse,
  type FlagInput,
  type ModerationDecision,
  type ReviewInput,
} from "@/lib/community/schemas";
import { apiErrorBodySchema } from "@/lib/security/api-error";

/** Browser calls to the community API (same-origin, cookie session). */

const JSON_HEADERS = { "Content-Type": "application/json" };
const encode = encodeURIComponent;

export const communityPath = (placeId: string) => `/api/community/${encode(placeId)}`;

export const fetchCommunity = (placeId: string) =>
  requestApi(communityPath(placeId), { method: "GET" }, communityPlaceResponseSchema);

/**
 * Loads community data for a place. `version` re-fetches after the member
 * changes something (e.g. submits a report).
 */
export function useCommunity(placeId: string, version: number) {
  return useKeyedRequest<ApiOutcome<CommunityPlaceResponse>>(`community:${placeId}:${version}`, () =>
    fetchCommunity(placeId),
  );
}

/** Mutations: 204/201 or a typed error code. */
async function mutate(url: string, method: string, body?: unknown): Promise<ApiOutcome<unknown>> {
  try {
    const response = await fetch(url, {
      method,
      ...(body !== undefined && { headers: JSON_HEADERS, body: JSON.stringify(body) }),
    });
    if (response.ok) {
      return { ok: true, data: response.status === 204 ? null : await response.json().catch(() => null) };
    }
    const parsed = apiErrorBodySchema.safeParse(await response.json().catch(() => null));
    return { ok: false, code: parsed.success ? parsed.data.error.code : "INTERNAL_ERROR" };
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }
}

export const submitAmenities = (placeId: string, input: AmenityReportInput) =>
  mutate(`${communityPath(placeId)}/amenities`, "PUT", input);

export const removeAmenity = (placeId: string, amenity: CommunityAmenity) =>
  mutate(`${communityPath(placeId)}/amenities?${new URLSearchParams({ amenity }).toString()}`, "DELETE");

export async function saveReview(placeId: string, input: ReviewInput) {
  const outcome = await mutate(`${communityPath(placeId)}/review`, "PUT", input);
  const status = z.object({ status: z.string() }).safeParse(outcome.ok ? outcome.data : null);
  return outcome.ok ? { ok: true as const, status: status.success ? status.data.status : "approved" } : outcome;
}

export const deleteReview = (placeId: string) => mutate(`${communityPath(placeId)}/review`, "DELETE");

export const vote = (reviewId: string, helpful: boolean) =>
  mutate(`/api/community/reviews/${encode(reviewId)}/vote`, "PUT", { helpful });

export const removeVote = (reviewId: string) => mutate(`/api/community/reviews/${encode(reviewId)}/vote`, "DELETE");

export const flagContent = (input: FlagInput) => mutate("/api/community/flags", "POST", input);

const moderationItemSchema = z.object({
  targetType: z.enum(["amenity_report", "review"]),
  targetId: z.string(),
  placeId: z.string(),
  status: z.string(),
  amenity: z.string().nullable(),
  value: z.string().nullable(),
  rating: z.number().nullable(),
  body: z.string().nullable(),
  flagCount: z.number(),
  flagReasons: z.array(z.string()),
  updatedAt: z.string(),
});
export type ModerationQueueItem = z.infer<typeof moderationItemSchema>;

export const fetchModerationQueue = () =>
  requestApi("/api/moderation", { method: "GET" }, z.object({ items: z.array(moderationItemSchema) }));

export const decideModeration = (decision: ModerationDecision) => mutate("/api/moderation", "POST", decision);

/** User-facing text for failures (API codes plus transport). */
export function communityErrorText(code: string): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Please sign in again to contribute.";
    case "RATE_LIMITED":
      return "You've reached the contribution limit for now. Please try again later.";
    case "FORBIDDEN":
      return "That action isn't allowed on this item.";
    case "VALIDATION_ERROR":
      return "Some details aren't valid. Please check and try again.";
    case "NETWORK_ERROR":
      return "Check your internet connection and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
