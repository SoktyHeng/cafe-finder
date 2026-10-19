import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ssr = vi.hoisted(() => ({
  claims: null as { sub: string } | null,
  rotate: false,
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: ssr.createServerClient,
}));

const env = vi.hoisted(() => ({ configured: true }));
vi.mock("@/lib/config/public-env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: env.configured ? "https://project.supabase.co" : undefined,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.configured ? "sb_publishable_test" : undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
  }),
}));

import { isProtectedPath, updateSession } from "./proxy";

beforeEach(() => {
  env.configured = true;
  ssr.claims = null;
  ssr.rotate = false;
  ssr.createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[], headers: Record<string, string>) => void } }) => ({
      auth: {
        getClaims: async () => {
          if (ssr.rotate) {
            // Simulates a token refresh: the library writes new cookies + no-store headers.
            options.cookies.setAll(
              [{ name: "sb-project-auth-token", value: "rotated", options: { httpOnly: true, path: "/" } }],
              { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" },
            );
          }
          return { data: ssr.claims ? { claims: ssr.claims } : null, error: null };
        },
      },
    }),
  );
});

const request = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

describe("isProtectedPath", () => {
  it.each([
    ["/favorites", true],
    ["/favorites/x", true],
    ["/account", true],
    ["/accounts", false],
    ["/discover", false],
    ["/", false],
    ["/moderation", true],
  ])("%s -> %s", (path, expected) => {
    expect(isProtectedPath(path)).toBe(expected);
  });
});

describe("updateSession", () => {
  it("passes through untouched when Supabase isn't configured", async () => {
    env.configured = false;
    const response = await updateSession(request("/favorites"));
    expect(response.headers.get("location")).toBeNull();
    expect(ssr.createServerClient).not.toHaveBeenCalled();
  });

  it("redirects signed-out visitors from protected pages to login with next", async () => {
    const response = await updateSession(request("/favorites?tab=visited"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2Ffavorites%3Ftab%3Dvisited");
  });

  it("lets guests through on public pages", async () => {
    const response = await updateSession(request("/discover"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets signed-in users reach protected pages", async () => {
    ssr.claims = { sub: "user-a" };
    const response = await updateSession(request("/account"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("forwards rotated session cookies and the library's no-store headers", async () => {
    ssr.claims = { sub: "user-a" };
    ssr.rotate = true;
    const response = await updateSession(request("/discover"));
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("rotated");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
