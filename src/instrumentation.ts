/**
 * Runs once when the Next.js server starts. Validating here makes a
 * misconfigured deployment fail fast instead of on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getServerEnv } = await import("@/lib/config/server-env");
    const { getPublicEnv } = await import("@/lib/config/public-env");
    getServerEnv();
    getPublicEnv();
  }
}
