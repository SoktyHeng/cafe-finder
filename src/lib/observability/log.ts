/**
 * Structured server logs. Callers pass only coarse, non-sensitive fields:
 * never API keys, tokens, coordinates, place names or raw vendor payloads.
 */
type LogValue = string | number | boolean | undefined;

export type LogLevel = "info" | "warn" | "error";

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, LogValue> = {},
): void {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
