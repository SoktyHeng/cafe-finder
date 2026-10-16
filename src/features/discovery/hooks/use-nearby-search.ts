"use client";

import { useCallback, useEffect, useState } from "react";

import type { DiscoveryRequest } from "@/lib/discovery/request-schema";

import { fetchNearbyCafes, type SearchOutcome } from "../api-client";

/**
 * Requests in flight, keyed by search. React Strict Mode runs effects twice
 * in development, and remounts can repeat them. Sharing the promise means one
 * user-initiated search is exactly one API call.
 */
const inFlight = new Map<string, Promise<SearchOutcome>>();

function requestOnce(key: string, request: DiscoveryRequest): Promise<SearchOutcome> {
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }
  const promise = fetchNearbyCafes(request).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export type NearbySearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; outcome: SearchOutcome };

/**
 * Runs a search for `request` whenever `searchKey` changes. Callers derive the
 * key from an explicit user action (the URL after "Find My Cafe"), never from
 * live form edits. Responses for superseded keys are ignored.
 */
export function useNearbySearch(
  request: DiscoveryRequest | null,
  searchKey: string | null,
): { state: NearbySearchState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; outcome: SearchOutcome } | null>(
    null,
  );

  const fullKey = request !== null && searchKey !== null ? `${searchKey}#${attempt}` : null;

  useEffect(() => {
    if (request === null || fullKey === null) {
      return;
    }
    let current = true;
    void requestOnce(fullKey, request).then((outcome) => {
      if (current) {
        setSettled({ key: fullKey, outcome });
      }
    });
    return () => {
      current = false;
    };
  }, [fullKey, request]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  let state: NearbySearchState;
  if (fullKey === null) {
    state = { status: "idle" };
  } else if (settled?.key === fullKey) {
    state = { status: "done", outcome: settled.outcome };
  } else {
    state = { status: "loading" };
  }
  return { state, retry };
}
