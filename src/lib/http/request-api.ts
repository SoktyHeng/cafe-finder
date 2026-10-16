import type { z } from "zod";

import { apiErrorBodySchema, type ApiErrorCode } from "@/lib/security/api-error";

/** Client-side failure codes: the API contract's codes plus transport problems. */
export type ApiFailureCode = ApiErrorCode | "NETWORK_ERROR" | "INVALID_RESPONSE";

export type ApiOutcome<T> = { ok: true; data: T } | { ok: false; code: ApiFailureCode };

/**
 * Calls one of our own API routes and validates the response against its
 * contract. Never throws: network, error and malformed responses all become
 * typed outcomes the UI can render.
 */
export async function requestApi<S extends z.ZodType>(
  input: string,
  init: RequestInit,
  schema: S,
  fetchImpl: typeof fetch = fetch,
): Promise<ApiOutcome<z.infer<S>>> {
  let response: Response;
  try {
    response = await fetchImpl(input, init);
  } catch {
    return { ok: false, code: "NETWORK_ERROR" };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: response.ok ? "INVALID_RESPONSE" : "INTERNAL_ERROR" };
  }

  if (!response.ok) {
    const parsed = apiErrorBodySchema.safeParse(body);
    return { ok: false, code: parsed.success ? parsed.data.error.code : "INTERNAL_ERROR" };
  }

  const parsed = schema.safeParse(body);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: "INVALID_RESPONSE" };
}
