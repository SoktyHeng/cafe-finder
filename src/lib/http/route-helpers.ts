import type { z } from "zod";

import { apiError } from "@/lib/security/api-error";

/** Shared request handling for cookie-authenticated JSON APIs. */

export const MUTATING_METHODS: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const MAX_JSON_BODY_BYTES = 4_096;

/**
 * Cookie-authenticated mutations must come from our own pages. Browsers
 * always send `Origin` on cross-origin and on non-GET same-origin fetches,
 * so a missing or foreign Origin is rejected (CSRF protection).
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

/** JSON only, size-limited, strict schema; errors name fields, never values. */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<Parsed<z.infer<S>>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, response: apiError("VALIDATION_ERROR", "Expected a JSON request body.") };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, response: apiError("VALIDATION_ERROR", "Request body is too large.") };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, response: apiError("VALIDATION_ERROR", "Request body is not valid JSON.") };
  }
  return validate(raw, schema);
}

export function validate<S extends z.ZodType>(raw: unknown, schema: S): Parsed<z.infer<S>> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "body"))];
    return { ok: false, response: apiError("VALIDATION_ERROR", `Invalid fields: ${fields.join(", ")}.`) };
  }
  return { ok: true, value: parsed.data };
}

export const privateJson = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
