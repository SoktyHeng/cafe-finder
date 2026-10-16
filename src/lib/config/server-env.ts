import "server-only";

import { parseServerEnv, type ServerEnv } from "./env-schema";

let cached: ServerEnv | undefined;

/**
 * Validated server-side configuration. Throws `EnvValidationError` (listing
 * variable names only) on first access if the environment is misconfigured.
 */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
