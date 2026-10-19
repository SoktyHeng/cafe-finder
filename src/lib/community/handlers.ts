import { z } from "zod";

import { MUTATING_METHODS, isSameOrigin, noContent, privateJson, readJson, validate } from "@/lib/http/route-helpers";
import { logEvent } from "@/lib/observability/log";
import { PLACE_ID_PATTERN } from "@/lib/places/schemas";
import { apiError } from "@/lib/security/api-error";
import { FixedWindowRateLimiter } from "@/lib/security/rate-limit";

import { aggregateReports } from "./aggregate";
import {
  COMMUNITY_AMENITIES,
  amenityReportInputSchema,
  flagInputSchema,
  moderationDecisionSchema,
  reviewInputSchema,
  voteInputSchema,
  type CommunityPlaceResponse,
} from "./schemas";
import { CommunityError, type CommunityMemberStore, type CommunityReader } from "./store";

export const COMMUNITY_READS_PER_MINUTE = 60;
export const COMMUNITY_WRITES_PER_MINUTE = 30;

export type CommunityContext =
  | "unconfigured"
  | {
      reader: CommunityReader;
      /** Present when a verified member is signed in. */
      member: { userId: string; store: CommunityMemberStore } | null;
    };

export type CommunityDeps = {
  getContext: () => Promise<CommunityContext>;
  /** Privacy-preserving client key for guest rate limiting. */
  clientKey: (request: Request) => string;
  now?: () => Date;
  readLimiter?: FixedWindowRateLimiter;
  writeLimiter?: FixedWindowRateLimiter;
};

const placeIdSchema = z.string().regex(PLACE_ID_PATTERN);
const reviewIdSchema = z.uuid();
const amenityQuerySchema = z.enum(COMMUNITY_AMENITIES);

const ERROR_RESPONSES: Record<CommunityError["kind"], () => Response> = {
  limit: () => apiError("RATE_LIMITED", "You've reached today's contribution limit. Please try again tomorrow."),
  duplicate: () => apiError("VALIDATION_ERROR", "You've already done that."),
  not_allowed: () => apiError("FORBIDDEN", "That action isn't allowed on this item."),
  not_found: () => apiError("NOT_FOUND", "That item no longer exists."),
  invalid: () => apiError("VALIDATION_ERROR", "Some values are not allowed."),
  unavailable: () => apiError("UPSTREAM_UNAVAILABLE", "Community features are temporarily unavailable."),
};

function mapError(error: unknown, operation: string): Response {
  if (error instanceof CommunityError) {
    if (error.kind === "unavailable") logEvent("error", "community_failed", { operation, kind: error.kind });
    return ERROR_RESPONSES[error.kind]();
  }
  logEvent("error", "community_failed", { operation, errorName: error instanceof Error ? error.name : "unknown" });
  return ERROR_RESPONSES.unavailable();
}

const rateLimited = (retryAfterSeconds: number) =>
  apiError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.", {
    "Retry-After": String(retryAfterSeconds),
  });

export function createCommunityHandlers({
  getContext,
  clientKey,
  now = () => new Date(),
  readLimiter = new FixedWindowRateLimiter({ limit: COMMUNITY_READS_PER_MINUTE, windowMs: 60_000 }),
  writeLimiter = new FixedWindowRateLimiter({ limit: COMMUNITY_WRITES_PER_MINUTE, windowMs: 60_000 }),
}: CommunityDeps) {
  async function context(): Promise<CommunityContext | Response> {
    try {
      return await getContext();
    } catch {
      return ERROR_RESPONSES.unavailable();
    }
  }

  /** Member-only operations: CSRF check, verified session, per-member limit. */
  const memberRoute =
    (operation: string, run: (request: Request, store: CommunityMemberStore, params: Record<string, string>) => Promise<Response>) =>
    async (request: Request, params: Record<string, string> = {}): Promise<Response> => {
      if (MUTATING_METHODS.has(request.method) && !isSameOrigin(request)) {
        return apiError("FORBIDDEN", "Cross-site requests are not allowed.");
      }
      const ctx = await context();
      if (ctx instanceof Response) return ctx;
      if (ctx === "unconfigured") return apiError("UPSTREAM_UNAVAILABLE", "Community features aren't available on this site.");
      if (!ctx.member) return apiError("AUTH_REQUIRED", "Please sign in to contribute.");
      const limited = writeLimiter.consume(ctx.member.userId);
      if (!limited.allowed) return rateLimited(limited.retryAfterSeconds);
      try {
        return await run(request, ctx.member.store, params);
      } catch (error) {
        return mapError(error, operation);
      }
    };

  const withPlace = (raw: string | undefined) => validate(raw, placeIdSchema);

  return {
    /** GET /api/community/[placeId]: public summary, reviews, and (if signed in) the member's own items. */
    async place(request: Request, rawPlaceId: string): Promise<Response> {
      const placeId = withPlace(rawPlaceId);
      if (!placeId.ok) return placeId.response;
      const ctx = await context();
      if (ctx instanceof Response) return ctx;
      if (ctx === "unconfigured") return apiError("UPSTREAM_UNAVAILABLE", "Community features aren't available on this site.");
      const limited = readLimiter.consume(ctx.member?.userId ?? clientKey(request));
      if (!limited.allowed) return rateLimited(limited.retryAfterSeconds);
      try {
        const [reports, reviews, mine] = await Promise.all([
          ctx.reader.amenityReports([placeId.value]),
          ctx.reader.reviews(placeId.value),
          ctx.member ? ctx.member.store.myContributions(placeId.value) : Promise.resolve(null),
        ]);
        const body: CommunityPlaceResponse = {
          placeId: placeId.value,
          amenities: aggregateReports(reports, now()).get(placeId.value) ?? [],
          reviews,
          mine,
        };
        return privateJson(body);
      } catch (error) {
        return mapError(error, "community.read");
      }
    },

    submitAmenities: memberRoute("community.amenities.submit", async (request, store, params) => {
      const placeId = withPlace(params.placeId);
      if (!placeId.ok) return placeId.response;
      const body = await readJson(request, amenityReportInputSchema);
      if (!body.ok) return body.response;
      await store.submitAmenities(placeId.value, body.value);
      return noContent();
    }),

    removeAmenity: memberRoute("community.amenities.remove", async (request, store, params) => {
      const placeId = withPlace(params.placeId);
      if (!placeId.ok) return placeId.response;
      const amenity = validate(new URL(request.url).searchParams.get("amenity"), amenityQuerySchema);
      if (!amenity.ok) return amenity.response;
      await store.removeAmenity(placeId.value, amenity.value);
      return noContent();
    }),

    saveReview: memberRoute("community.review.save", async (request, store, params) => {
      const placeId = withPlace(params.placeId);
      if (!placeId.ok) return placeId.response;
      const body = await readJson(request, reviewInputSchema);
      if (!body.ok) return body.response;
      const status = await store.saveReview(placeId.value, body.value);
      return privateJson({ status });
    }),

    deleteReview: memberRoute("community.review.delete", async (_request, store, params) => {
      const placeId = withPlace(params.placeId);
      if (!placeId.ok) return placeId.response;
      await store.deleteReview(placeId.value);
      return noContent();
    }),

    vote: memberRoute("community.vote", async (request, store, params) => {
      const reviewId = validate(params.reviewId, reviewIdSchema);
      if (!reviewId.ok) return reviewId.response;
      const body = await readJson(request, voteInputSchema);
      if (!body.ok) return body.response;
      await store.vote(reviewId.value, body.value.helpful);
      return noContent();
    }),

    removeVote: memberRoute("community.vote.remove", async (_request, store, params) => {
      const reviewId = validate(params.reviewId, reviewIdSchema);
      if (!reviewId.ok) return reviewId.response;
      await store.removeVote(reviewId.value);
      return noContent();
    }),

    flag: memberRoute("community.flag", async (request, store) => {
      const body = await readJson(request, flagInputSchema);
      if (!body.ok) return body.response;
      await store.flag(body.value);
      return privateJson({ flagged: true }, 201);
    }),

    moderationQueue: memberRoute("moderation.queue", async (_request, store) => {
      if (!(await store.isModerator())) return apiError("FORBIDDEN", "Moderators only.");
      return privateJson({ items: await store.moderationQueue() });
    }),

    moderate: memberRoute("moderation.decide", async (request, store) => {
      const body = await readJson(request, moderationDecisionSchema);
      if (!body.ok) return body.response;
      if (!(await store.isModerator())) return apiError("FORBIDDEN", "Moderators only.");
      await store.moderate(body.value);
      logEvent("info", "moderation_decision", { targetType: body.value.targetType, decision: body.value.decision });
      return noContent();
    }),
  };
}
