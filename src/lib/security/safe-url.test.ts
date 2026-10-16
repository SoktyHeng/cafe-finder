import { describe, expect, it } from "vitest";

import { safeGoogleMapsUrl, safeGooglePhotoUrl, safeWebUrl } from "./safe-url";

describe("safeGoogleMapsUrl", () => {
  it.each([
    ["https://maps.google.com/?cid=123", true],
    ["https://www.google.com/maps/place/?q=place_id:ChIJ", true],
    ["https://maps.app.goo.gl/abc", true],
    ["https://www.google.com/search?q=x", false],
    ["http://maps.google.com/?cid=1", false],
    ["https://maps.google.com.evil.example/", false],
    ["javascript:alert(1)", false],
    [undefined, false],
  ])("%s -> allowed=%s", (raw, allowed) => {
    expect(safeGoogleMapsUrl(raw) !== undefined).toBe(allowed);
  });
});

describe("safeGooglePhotoUrl", () => {
  it.each([
    ["https://lh3.googleusercontent.com/p/x=s400", true],
    ["https://googleusercontent.com.evil.example/x", false],
    ["http://lh3.googleusercontent.com/x", false],
  ])("%s -> allowed=%s", (raw, allowed) => {
    expect(safeGooglePhotoUrl(raw) !== undefined).toBe(allowed);
  });
});

describe("safeWebUrl", () => {
  it.each([
    ["https://cafe.example/", true],
    ["http://cafe.example/", true],
    ["data:text/html,hi", false],
    ["https://user:pass@cafe.example/", false],
    ["not a url", false],
  ])("%s -> allowed=%s", (raw, allowed) => {
    expect(safeWebUrl(raw) !== undefined).toBe(allowed);
  });
});
