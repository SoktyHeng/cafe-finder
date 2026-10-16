import { describe, expect, it, vi } from "vitest";

import type { DiscoveryRequest } from "@/lib/discovery/request-schema";

import { NEARBY_SEARCH_PATH, fetchNearbyCafes } from "./api-client";

const REQUEST: DiscoveryRequest = {
  latitude: 11.553,
  longitude: 104.925,
  radiusMeters: 3000,
  purpose: "work",
};

const OK_BODY = {
  results: [],
  searchedAt: "2026-10-16T00:00:00.000Z",
  source: "fixture",
  coverageNote: "Results are a subset of nearby cafes, not an exhaustive list.",
  excluded: { belowMinRating: 0, closedNow: 0, permanentlyClosed: 0 },
};

const respond = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );

describe("fetchNearbyCafes", () => {
  it("POSTs JSON to the nearby endpoint", async () => {
    const fetchMock = respond(OK_BODY);
    await fetchNearbyCafes(REQUEST, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(NEARBY_SEARCH_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REQUEST),
    });
  });

  it("returns validated data on success", async () => {
    expect(await fetchNearbyCafes(REQUEST, respond(OK_BODY))).toEqual({
      ok: true,
      data: OK_BODY,
    });
  });

  it.each([
    ["RATE_LIMITED", 429],
    ["UPSTREAM_UNAVAILABLE", 503],
    ["VALIDATION_ERROR", 400],
  ] as const)("surfaces %s error codes", async (code, status) => {
    const outcome = await fetchNearbyCafes(
      REQUEST,
      respond({ error: { code, message: "x" } }, status),
    );
    expect(outcome).toEqual({ ok: false, code });
  });

  it("treats network failures as NETWORK_ERROR", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    expect(await fetchNearbyCafes(REQUEST, fetchMock)).toEqual({
      ok: false,
      code: "NETWORK_ERROR",
    });
  });

  it("treats unexpected success payloads as INVALID_RESPONSE", async () => {
    expect(await fetchNearbyCafes(REQUEST, respond({ results: "nope" }))).toEqual({
      ok: false,
      code: "INVALID_RESPONSE",
    });
  });

  it("treats non-JSON error pages as INTERNAL_ERROR", async () => {
    expect(await fetchNearbyCafes(REQUEST, respond("<html>Bad gateway</html>", 502))).toEqual(
      { ok: false, code: "INTERNAL_ERROR" },
    );
  });
});
