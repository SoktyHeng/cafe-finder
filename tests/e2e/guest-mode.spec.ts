import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * The E2E server runs without Supabase (guest-only mode). Guests must be able
 * to do everything except save, and nothing account-related may break.
 */
test.describe("guest mode (no Supabase configured)", () => {
  test("search, results and details work with no sign-in UI anywhere", async ({ page }) => {
    await page.goto("/discover?area=bkk1&purpose=work&radius=3000");
    const firstCard = page.getByRole("list", { name: /Cafes, best match first/ }).getByRole("article").first();
    await expect(firstCard).toBeVisible();

    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link")).toHaveText(["Discover"]);
    await expect(firstCard.getByRole("button", { name: /^save/i })).toHaveCount(0);
    await expect(firstCard.getByRole("link", { name: /sign in to save/i })).toHaveCount(0);

    await firstCard.getByRole("link", { name: /details/i }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /mark as visited/i })).toHaveCount(0);
  });

  for (const path of ["/favorites", "/account", "/login"]) {
    test(`${path} explains that accounts aren't available`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByTestId("auth-unavailable")).toBeVisible();
      await expect(page.getByRole("link", { name: "Search for cafes" })).toHaveAttribute("href", "/");
    });
  }

  test("login page is accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("auth-unavailable")).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);
  });
});

test.describe("user-data API without a session", () => {
  test("reads report sign-in unavailable; nothing is exposed", async ({ request }) => {
    const response = await request.get("/api/favorites");
    expect(response.status()).toBe(503);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.json()).toEqual({
      error: { code: "UPSTREAM_UNAVAILABLE", message: "Sign-in isn't available on this site." },
    });
  });

  test("cross-site mutations are refused before any session lookup", async ({ request }) => {
    for (const [method, path] of [
      ["POST", "/api/favorites"],
      ["PUT", "/api/preferences"],
      ["DELETE", "/api/account"],
    ] as const) {
      const response = await request.fetch(path, {
        method,
        headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
        data: { placeId: "ChIJx" },
      });
      expect(response.status(), `${method} ${path}`).toBe(403);
    }
  });

  test("auth callbacks fail safely without parameters", async ({ page }) => {
    await page.goto("/auth/callback");
    await expect(page).toHaveURL(/\/login\?error=oauth$/);
    await page.goto("/auth/confirm?token_hash=x&type=nope");
    await expect(page).toHaveURL(/\/login\?error=confirm$/);
  });
});
