import { createHash } from "node:crypto";

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type Window = { startedAt: number; count: number };

export type FixedWindowRateLimiterOptions = {
  limit: number;
  windowMs: number;
  /** Bounds memory: expired windows are swept, then the oldest keys evicted. */
  maxKeys?: number;
  now?: () => number;
};

const DEFAULT_MAX_KEYS = 10_000;

/**
 * In-memory fixed-window limiter. Limits are per server instance; on
 * multi-instance or serverless hosting they are a best-effort first line,
 * backed by Google Cloud quotas and budget alerts (see docs/deployment.md).
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor({ limit, windowMs, maxKeys = DEFAULT_MAX_KEYS, now = Date.now }: FixedWindowRateLimiterOptions) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.now = now;
  }

  consume(key: string): RateLimitResult {
    const now = this.now();
    let window = this.windows.get(key);
    if (!window || now - window.startedAt >= this.windowMs) {
      window = { startedAt: now, count: 0 };
      this.windows.delete(key);
      this.windows.set(key, window);
      this.enforceMaxKeys(now);
    }
    if (window.count >= this.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + this.windowMs - now) / 1000)),
      };
    }
    window.count += 1;
    return { allowed: true };
  }

  get size(): number {
    return this.windows.size;
  }

  private enforceMaxKeys(now: number) {
    if (this.windows.size <= this.maxKeys) return;
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key);
    }
    // Map iteration is insertion order: the oldest windows go first.
    for (const key of this.windows.keys()) {
      if (this.windows.size <= this.maxKeys) break;
      this.windows.delete(key);
    }
  }
}

/** Bucket shared by all clients when the proxy headers can't be trusted. */
export const SHARED_CLIENT_KEY = "shared";

/**
 * Privacy-preserving client identifier for rate limiting. The IP is hashed
 * and only kept in memory; it is never logged. Proxy headers are used only
 * when `trustProxy` is set, because clients can forge them otherwise.
 */
export function clientKeyFromRequest(request: Request, trustProxy: boolean): string {
  if (!trustProxy) {
    return SHARED_CLIENT_KEY;
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim();
  if (!ip) {
    return SHARED_CLIENT_KEY;
  }
  return createHash("sha256").update(ip).digest("base64url").slice(0, 22);
}
