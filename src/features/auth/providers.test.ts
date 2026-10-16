import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAuthProviders, resetAuthProvidersCache } from "./providers";

const CONFIG = { url: "https://project.supabase.co", key: "sb_publishable_test" };
const settings = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => resetAuthProvidersCache());

describe("getAuthProviders", () => {
  it("reads Google's status from the public settings endpoint with the publishable key", async () => {
    const fetchImpl = settings({ external: { email: true, google: false }, disable_signup: false });
    expect(await getAuthProviders(CONFIG, { fetchImpl })).toEqual({ google: false });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://project.supabase.co/auth/v1/settings");
    expect(init?.headers).toEqual({ apikey: "sb_publishable_test" });
  });

  it("caches for five minutes", async () => {
    let time = 0;
    const fetchImpl = settings({ external: { google: true } });
    await getAuthProviders(CONFIG, { fetchImpl, now: () => time });
    time = 4 * 60_000;
    await getAuthProviders(CONFIG, { fetchImpl, now: () => time });
    expect(fetchImpl).toHaveBeenCalledOnce();
    time = 6 * 60_000;
    await getAuthProviders(CONFIG, { fetchImpl, now: () => time });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["network failure", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"))],
    ["server error", settings({ message: "down" }, 500)],
    ["unexpected body", settings("nope")],
  ])("fails open on %s (Supabase still decides)", async (_label, fetchImpl) => {
    expect(await getAuthProviders(CONFIG, { fetchImpl })).toEqual({ google: true });
  });
});
