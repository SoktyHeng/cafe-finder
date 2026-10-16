import { describe, expect, it } from "vitest";

import { loginPath, safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/favorites", "/favorites"],
    ["/discover?area=bkk1&radius=3000", "/discover?area=bkk1&radius=3000"],
    ["/cafes/ChIJx#reviews", "/cafes/ChIJx#reviews"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    [null],
    [""],
    ["https://evil.example/"],
    ["//evil.example/"],
    ["/\\evil.example"],
    ["javascript:alert(1)"],
    ["favorites"],
    ["/login"],
    ["/auth/callback?code=x"],
    ["/ok\r\nSet-Cookie: x=1"],
    [`/${"a".repeat(3000)}`],
  ])("falls back for %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/");
  });

  it("uses the provided fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/discover")).toBe("/discover");
  });
});

describe("loginPath", () => {
  it("encodes a safe next path", () => {
    expect(loginPath("/favorites?x=1")).toBe("/login?next=%2Ffavorites%3Fx%3D1");
    expect(loginPath("https://evil.example")).toBe("/login?next=%2F");
  });
});
