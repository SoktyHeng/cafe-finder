/**
 * Post-login destinations are user-controlled (`?next=`), so only same-site
 * relative paths are allowed. Anything else falls back to `fallback`.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || raw.length > 2048) return fallback;
  // Must be an absolute path on this site: "/x", not "//evil", "/\\evil" or "https://…".
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, "https://cafe-finder.invalid");
    if (url.origin !== "https://cafe-finder.invalid") return fallback;
    // Never bounce back into the auth flow itself.
    if (url.pathname.startsWith("/auth/") || url.pathname === "/login") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** `/login?next=…` for a path that needs a signed-in user. */
export function loginPath(next: string): string {
  return `/login?${new URLSearchParams({ next: safeRedirectPath(next) }).toString()}`;
}
