import { describe, expect, it, vi } from "vitest";

import { FixedWindowRateLimiter, SHARED_CLIENT_KEY, clientKeyFromRequest } from "./rate-limit";
import { createRequestGuard } from "./request-guard";

function clock(start = 0) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("FixedWindowRateLimiter", () => {
  it("allows up to the limit per window, then reports Retry-After", () => {
    const time = clock();
    const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 60_000, now: time.now });

    expect(limiter.consume("a")).toEqual({ allowed: true });
    expect(limiter.consume("a")).toEqual({ allowed: true });
    time.advance(15_000);
    expect(limiter.consume("a")).toEqual({ allowed: false, retryAfterSeconds: 45 });
    expect(limiter.consume("b")).toEqual({ allowed: true });
  });

  it("resets after the window", () => {
    const time = clock();
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000, now: time.now });
    limiter.consume("a");
    expect(limiter.consume("a").allowed).toBe(false);
    time.advance(1000);
    expect(limiter.consume("a").allowed).toBe(true);
  });

  it("bounds memory by evicting expired, then oldest keys", () => {
    const time = clock();
    const limiter = new FixedWindowRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3, now: time.now });
    for (const key of ["a", "b", "c", "d", "e"]) limiter.consume(key);
    expect(limiter.size).toBe(3);
  });
});

describe("clientKeyFromRequest", () => {
  const request = (headers: Record<string, string>) => new Request("http://x/", { headers });

  it("ignores forgeable proxy headers unless trusted", () => {
    expect(clientKeyFromRequest(request({ "x-forwarded-for": "1.2.3.4" }), false)).toBe(SHARED_CLIENT_KEY);
  });

  it("hashes the first forwarded IP when trusted, never exposing it", () => {
    const key = clientKeyFromRequest(request({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }), true);
    expect(key).not.toContain("1.2.3.4");
    expect(key).toBe(clientKeyFromRequest(request({ "x-real-ip": "1.2.3.4" }), true));
    expect(key).not.toBe(clientKeyFromRequest(request({ "x-forwarded-for": "5.6.7.8" }), true));
  });

  it("falls back to the shared bucket without an IP", () => {
    expect(clientKeyFromRequest(request({}), true)).toBe(SHARED_CLIENT_KEY);
  });
});

describe("createRequestGuard", () => {
  it("applies the global cap across clients and logs the scope", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const globalLimiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 60_000 });
    const guard = createRequestGuard({ name: "t", perClientLimit: 5, globalLimiter, trustProxy: true });
    const from = (ip: string) => new Request("http://x/", { headers: { "x-forwarded-for": ip } });

    expect(guard(from("1.1.1.1"))).toBeNull();
    expect(guard(from("2.2.2.2"))).toBeNull();
    const limited = guard(from("3.3.3.3"));
    expect(limited?.status).toBe(429);
    expect(await limited?.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a moment and try again." },
    });
    expect(warn.mock.calls.flat().join(" ")).toContain('"scope":"global"');
    expect(warn.mock.calls.flat().join(" ")).not.toContain("3.3.3.3");
  });
});
