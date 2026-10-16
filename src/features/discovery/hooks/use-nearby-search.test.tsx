import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DiscoveryRequest } from "@/lib/discovery/request-schema";

import { fetchNearbyCafes, type SearchOutcome } from "../api-client";
import { useNearbySearch } from "./use-nearby-search";

vi.mock("../api-client", () => ({ fetchNearbyCafes: vi.fn() }));
const fetchMock = vi.mocked(fetchNearbyCafes);

const REQUEST: DiscoveryRequest = {
  latitude: 11.553,
  longitude: 104.925,
  radiusMeters: 3000,
  purpose: "work",
};

const SUCCESS: SearchOutcome = {
  ok: true,
  data: {
    results: [],
    searchedAt: "2026-10-16T00:00:00.000Z",
    source: "fixture",
    coverageNote: "",
    excluded: { belowMinRating: 0, closedNow: 0, permanentlyClosed: 0 },
    attributions: [],
  },
};

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

let keyCounter = 0;
const uniqueKey = () => `test-${keyCounter++}`;

beforeEach(() => {
  fetchMock.mockReset();
});

describe("useNearbySearch", () => {
  it("stays idle and does not fetch without a request", () => {
    const { result } = renderHook(() => useNearbySearch(null, null), { wrapper: strict });
    expect(result.current.state).toEqual({ status: "idle" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches exactly once under Strict Mode and reports the outcome", async () => {
    fetchMock.mockResolvedValue(SUCCESS);
    const key = uniqueKey();
    const { result } = renderHook(() => useNearbySearch(REQUEST, key), { wrapper: strict });

    expect(result.current.state.status).toBe("loading");
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "done", outcome: SUCCESS }),
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not refetch on re-render with the same key", async () => {
    fetchMock.mockResolvedValue(SUCCESS);
    const key = uniqueKey();
    const { result, rerender } = renderHook(() => useNearbySearch(REQUEST, key));
    await waitFor(() => expect(result.current.state.status).toBe("done"));

    rerender();
    rerender();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("refetches on retry", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, code: "UPSTREAM_UNAVAILABLE" });
    fetchMock.mockResolvedValueOnce(SUCCESS);
    const key = uniqueKey();
    const { result } = renderHook(() => useNearbySearch(REQUEST, key));
    await waitFor(() => expect(result.current.state.status).toBe("done"));

    act(() => result.current.retry());
    expect(result.current.state.status).toBe("loading");
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "done", outcome: SUCCESS }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale response after the search changes", async () => {
    let resolveFirst: (outcome: SearchOutcome) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise<SearchOutcome>((resolve) => (resolveFirst = resolve)),
    );
    const second: SearchOutcome = { ok: false, code: "RATE_LIMITED" };
    fetchMock.mockResolvedValueOnce(second);

    const firstKey = uniqueKey();
    const secondKey = uniqueKey();
    const { result, rerender } = renderHook(
      ({ searchKey }) => useNearbySearch(REQUEST, searchKey),
      { initialProps: { searchKey: firstKey } },
    );
    rerender({ searchKey: secondKey });
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "done", outcome: second }),
    );

    await act(async () => resolveFirst(SUCCESS));
    expect(result.current.state).toEqual({ status: "done", outcome: second });
  });
});
