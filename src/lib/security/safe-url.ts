/**
 * URL allowlisting for links and redirects derived from upstream data.
 * Returns the normalized URL string, or `undefined` if it is not acceptable.
 */

const GOOGLE_MAPS_HOSTS = new Set([
  "maps.google.com",
  "www.google.com",
  "google.com",
  "maps.app.goo.gl",
  "goo.gl",
]);

/** Hosts Google serves place photo media from. */
const GOOGLE_PHOTO_HOST_SUFFIX = ".googleusercontent.com";

function parse(raw: string | undefined): URL | undefined {
  if (raw === undefined) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

/** Plain http(s) web link with no embedded credentials (e.g. a cafe website). */
export function safeWebUrl(raw: string | undefined): string | undefined {
  const url = parse(raw);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) return undefined;
  if (url.username || url.password) return undefined;
  return url.toString();
}

export function safeHttpsUrl(raw: string | undefined): string | undefined {
  const url = parse(raw);
  return url?.protocol === "https:" && !url.username && !url.password
    ? url.toString()
    : undefined;
}

/** Official Google Maps place link. */
export function safeGoogleMapsUrl(raw: string | undefined): string | undefined {
  const safe = safeHttpsUrl(raw);
  if (!safe) return undefined;
  const { hostname, pathname } = new URL(safe);
  if (!GOOGLE_MAPS_HOSTS.has(hostname)) return undefined;
  // www.google.com and google.com are only acceptable for /maps paths.
  if ((hostname === "www.google.com" || hostname === "google.com") && !pathname.startsWith("/maps")) {
    return undefined;
  }
  return safe;
}

/** Image URL returned by the Place Photo API, safe to redirect a browser to. */
export function safeGooglePhotoUrl(raw: string | undefined): string | undefined {
  const safe = safeHttpsUrl(raw);
  if (!safe) return undefined;
  return new URL(safe).hostname.endsWith(GOOGLE_PHOTO_HOST_SUFFIX) ? safe : undefined;
}
