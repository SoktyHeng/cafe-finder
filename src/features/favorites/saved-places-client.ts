import { z } from "zod";

import { requestApi, type ApiOutcome } from "@/lib/http/request-api";
import { apiErrorBodySchema } from "@/lib/security/api-error";
import {
  favoritesResponseSchema,
  preferencesResponseSchema,
  profileResponseSchema,
  visitsResponseSchema,
  type Preferences,
} from "@/lib/user-data/schemas";

/** Browser calls to the user-data API (same-origin, cookie session). */

const JSON_HEADERS = { "Content-Type": "application/json" };
const empty = z.unknown();

export const listFavorites = () => requestApi("/api/favorites", { method: "GET" }, favoritesResponseSchema);

export const addFavorite = (placeId: string) =>
  requestApi("/api/favorites", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ placeId }) }, empty);

export const updateFavoriteNotes = (placeId: string, notes: string | null) =>
  requestApi(
    "/api/favorites",
    { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ placeId, notes }) },
    empty,
  );

export function removeFavorite(placeId: string): Promise<ApiOutcome<null>> {
  return deleteRequest(`/api/favorites?${new URLSearchParams({ placeId }).toString()}`);
}

export const listVisits = () => requestApi("/api/visits", { method: "GET" }, visitsResponseSchema);

export const markVisited = (placeId: string) =>
  requestApi("/api/visits", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ placeId }) }, empty);

export function unmarkVisited(placeId: string): Promise<ApiOutcome<null>> {
  return deleteRequest(`/api/visits?${new URLSearchParams({ placeId }).toString()}`);
}

export const getPreferences = () => requestApi("/api/preferences", { method: "GET" }, preferencesResponseSchema);

export const savePreferences = (preferences: Preferences) =>
  requestApi(
    "/api/preferences",
    { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(preferences) },
    preferencesResponseSchema,
  );

export const updateProfile = (displayName: string | null) =>
  requestApi(
    "/api/profile",
    { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ displayName }) },
    profileResponseSchema,
  );

export function deleteAccount(confirm: string): Promise<ApiOutcome<null>> {
  return deleteRequest("/api/account", JSON.stringify({ confirm }));
}

/** 204 responses have no body, so they're handled without JSON parsing. */
async function deleteRequest(url: string, body?: string): Promise<ApiOutcome<null>> {
  try {
    const response = await fetch(url, {
      method: "DELETE",
      ...(body !== undefined && { headers: JSON_HEADERS, body }),
    });
    if (response.status === 204) return { ok: true, data: null };
    const parsed = apiErrorBodySchema.safeParse(await response.json().catch(() => null));
    return { ok: false, code: parsed.success ? parsed.data.error.code : "INTERNAL_ERROR" };
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }
}
