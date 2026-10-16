"use client";

import { useCallback, useEffect, useState } from "react";

export type KeyedRequestState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; outcome: T };

/**
 * Requests in flight, keyed by caller-supplied keys. React Strict Mode runs
 * effects twice in development, and remounts can repeat them. Sharing the
 * promise means one user action is exactly one network call.
 */
const inFlight = new Map<string, Promise<unknown>>();

function requestOnce<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }
  const promise = run().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/**
 * Runs `run` once per distinct `key` (`null` = idle). Responses for superseded
 * keys are ignored, and `retry` re-runs the same request on purpose.
 *
 * `key` must identify the request fully, including its namespace (e.g.
 * "nearby:…" or "details:…"), because the in-flight map is shared.
 */
export function useKeyedRequest<T>(
  key: string | null,
  run: () => Promise<T>,
): { state: KeyedRequestState<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; outcome: T } | null>(null);
  const fullKey = key === null ? null : `${key}#${attempt}`;

  useEffect(() => {
    if (fullKey === null) {
      return;
    }
    let current = true;
    void requestOnce(fullKey, run).then((outcome) => {
      if (current) {
        setSettled({ key: fullKey, outcome });
      }
    });
    return () => {
      current = false;
    };
    // `run` is intentionally not a dependency: the key identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  let state: KeyedRequestState<T>;
  if (fullKey === null) {
    state = { status: "idle" };
  } else if (settled?.key === fullKey) {
    state = { status: "done", outcome: settled.outcome };
  } else {
    state = { status: "loading" };
  }
  return { state, retry };
}
