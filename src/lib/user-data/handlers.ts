import { z } from "zod";

import { logEvent } from "@/lib/observability/log";
import { apiError } from "@/lib/security/api-error";
import { MUTATING_METHODS, isSameOrigin, noContent, privateJson, readJson } from "@/lib/http/route-helpers";
import { FixedWindowRateLimiter } from "@/lib/security/rate-limit";

import {
  ACCOUNT_DELETION_CONFIRMATION,
  favoriteInputSchema,
  favoriteNotesSchema,
  placeIdSchema,
  preferencesSchema,
  profileInputSchema,
  visitInputSchema,
} from "./schemas";
import { UserDataError, type UserDataStore } from "./store";

export const USER_DATA_RATE_LIMIT_PER_MINUTE = 60;
const accountDeletionSchema = z.strictObject({ confirm: z.literal(ACCOUNT_DELETION_CONFIRMATION) });

export type UserContext = { userId: string; store: UserDataStore };

export type UserDataDeps = {
  /** `null` = no valid session; `"unconfigured"` = Supabase isn't set up. */
  getContext: () => Promise<UserContext | null | "unconfigured">;
  limiter?: FixedWindowRateLimiter;
};

type Authorized = { ok: true; context: UserContext } | { ok: false; response: Response };

function queryPlaceId(request: Request): { ok: true; value: string } | { ok: false; response: Response } {
  const parsed = placeIdSchema.safeParse(new URL(request.url).searchParams.get("placeId"));
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, response: apiError("VALIDATION_ERROR", "Invalid fields: placeId.") };
}

const json = privateJson;

function mapError(error: unknown, operation: string): Response {
  if (error instanceof UserDataError) {
    if (error.kind === "limit") {
      return apiError("VALIDATION_ERROR", "You've reached the limit of 500 saved cafes.");
    }
    if (error.kind === "invalid") return apiError("VALIDATION_ERROR", "Some values are not allowed.");
  }
  logEvent("error", "user_data_failed", {
    operation,
    errorName: error instanceof Error ? error.name : "unknown",
  });
  return apiError("UPSTREAM_UNAVAILABLE", "Your saved data is temporarily unavailable. Please try again.");
}

export function createUserDataHandlers({
  getContext,
  limiter = new FixedWindowRateLimiter({ limit: USER_DATA_RATE_LIMIT_PER_MINUTE, windowMs: 60_000 }),
}: UserDataDeps) {
  async function authorize(request: Request): Promise<Authorized> {
    if (MUTATING_METHODS.has(request.method) && !isSameOrigin(request)) {
      return { ok: false, response: apiError("FORBIDDEN", "Cross-site requests are not allowed.") };
    }
    let context: Awaited<ReturnType<typeof getContext>>;
    try {
      context = await getContext();
    } catch {
      return { ok: false, response: apiError("UPSTREAM_UNAVAILABLE", "Sign-in is temporarily unavailable.") };
    }
    if (context === "unconfigured") {
      return { ok: false, response: apiError("UPSTREAM_UNAVAILABLE", "Sign-in isn't available on this site.") };
    }
    if (!context) {
      return { ok: false, response: apiError("AUTH_REQUIRED", "Please sign in to continue.") };
    }
    const limited = limiter.consume(context.userId);
    if (!limited.allowed) {
      return {
        ok: false,
        response: apiError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.", {
          "Retry-After": String(limited.retryAfterSeconds),
        }),
      };
    }
    return { ok: true, context };
  }

  /** Wraps a handler with authorization and safe error mapping. */
  const route =
    (operation: string, run: (request: Request, store: UserDataStore) => Promise<Response>) =>
    async (request: Request): Promise<Response> => {
      const auth = await authorize(request);
      if (!auth.ok) return auth.response;
      try {
        return await run(request, auth.context.store);
      } catch (error) {
        return mapError(error, operation);
      }
    };

  return {
    favorites: {
      GET: route("favorites.list", async (_request, store) => json({ favorites: await store.listFavorites() })),
      POST: route("favorites.save", async (request, store) => {
        const body = await readJson(request, favoriteInputSchema);
        if (!body.ok) return body.response;
        return json({ favorite: await store.saveFavorite(body.value.placeId, body.value.notes) }, 201);
      }),
      PATCH: route("favorites.notes", async (request, store) => {
        const body = await readJson(request, favoriteNotesSchema);
        if (!body.ok) return body.response;
        const favorite = await store.updateFavoriteNotes(body.value.placeId, body.value.notes);
        return favorite ? json({ favorite }) : apiError("NOT_FOUND", "That cafe isn't in your favorites.");
      }),
      DELETE: route("favorites.remove", async (request, store) => {
        const placeId = queryPlaceId(request);
        if (!placeId.ok) return placeId.response;
        await store.removeFavorite(placeId.value);
        return noContent();
      }),
    },
    visits: {
      GET: route("visits.list", async (_request, store) => json({ visits: await store.listVisits() })),
      POST: route("visits.mark", async (request, store) => {
        const body = await readJson(request, visitInputSchema);
        if (!body.ok) return body.response;
        return json({ visit: await store.markVisited(body.value.placeId) }, 201);
      }),
      DELETE: route("visits.unmark", async (request, store) => {
        const placeId = queryPlaceId(request);
        if (!placeId.ok) return placeId.response;
        await store.unmarkVisited(placeId.value);
        return noContent();
      }),
    },
    preferences: {
      GET: route("preferences.get", async (_request, store) => json({ preferences: await store.getPreferences() })),
      PUT: route("preferences.save", async (request, store) => {
        const body = await readJson(request, preferencesSchema);
        if (!body.ok) return body.response;
        return json({ preferences: await store.savePreferences(body.value) });
      }),
    },
    profile: {
      GET: route("profile.get", async (_request, store) => json({ profile: await store.getProfile() })),
      PATCH: route("profile.update", async (request, store) => {
        const body = await readJson(request, profileInputSchema);
        if (!body.ok) return body.response;
        return json({ profile: await store.updateProfile(body.value.displayName) });
      }),
    },
    account: {
      DELETE: route("account.delete", async (request, store) => {
        // Explicit confirmation, so a stray request can't erase an account.
        const body = await readJson(request, accountDeletionSchema);
        if (!body.ok) return body.response;
        await store.deleteAccount();
        logEvent("info", "account_deleted");
        return noContent();
      }),
    },
  };
}

/** Re-exported for existing imports and tests. */
export { isSameOrigin };
