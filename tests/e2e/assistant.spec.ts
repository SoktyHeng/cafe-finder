import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("AI disabled: regular discovery remains available", async ({ page }, testInfo) => {
  test.skip(testInfo.config.configFile?.endsWith("playwright.ai.config.ts") ?? false, "disabled-mode suite only");
  await page.goto("/assistant");
  await expect(page.getByText("AI search is turned off.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Use the regular search filters" })).toHaveAttribute("href", "/discover");
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Assistant", exact: true })).toHaveCount(0);
});

test.describe("AI fixture conversation", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(!(testInfo.config.configFile?.endsWith("playwright.ai.config.ts") ?? false), "enabled-mode suite only");
  });
  for (const width of [375, 768, 1024, 1440]) {
    test(`assistant layout and results at ${width}px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop-chromium", "Explicit widths run once");
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/assistant");
      const input = page.getByRole("textbox", { name: /What kind of cafe/ });
      await input.fill("Find a quiet cafe with Wi-Fi under $5 in BKK1.");
      await page.getByRole("button", { name: "Search with assistant" }).click();
      await expect(page.getByRole("heading", { name: /cafes within 3 km/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`assistant-${width}.png`), fullPage: true });
    });
  }
  test("search, follow-up, grounded results, details and regular fallback", async ({ page }) => {
    let calls = 0;
    page.on("request", (request) => { if (request.url().endsWith("/api/assistant")) calls++; });
    await page.goto("/assistant");
    await expect(page.getByText("Scripted demo, not live AI.", { exact: false })).toBeVisible();
    const input = page.getByRole("textbox", { name: "What kind of cafe are you looking for?" });
    await input.fill("Find a quiet cafe with Wi-Fi under $5 in BKK1.");
    expect(calls).toBe(0);
    await page.getByRole("button", { name: "Search with assistant" }).click();
    await expect(page.getByRole("heading", { name: /cafes within 3 km/ })).toBeVisible();
    expect(calls).toBe(1);
    const settings = page.getByRole("region", { name: "Interpreted search" });
    await expect(settings).toContainText("Wi-Fi preference: Yes");
    await expect(settings).toContainText("not a guaranteed menu price");
    await expect(page.getByText("From Cafe Finder members (not Google)", { exact: true })).toHaveCount(0);
    await input.fill("Only open now, within 2 km.");
    await page.getByRole("button", { name: "Search with assistant" }).click();
    await expect(page.getByRole("heading", { name: /cafes within 2 km/ })).toBeVisible();
    expect(calls).toBe(2);
    await expect(settings).toContainText("Open now");
    await expect(settings).toContainText("Under $5");
    const fallback = page.getByRole("link", { name: "Use regular search filters" });
    await expect(fallback).toHaveAttribute("href", /wifi=1/);
    await expect(fallback).toHaveAttribute("href", /radius=2000/);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("link", { name: /^Details/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Cafe search assistant");
  });
  test("near me without permission asks for location and does not fetch Places", async ({ page }) => {
    let placesCalls = 0;
    page.on("request", (request) => { if (request.url().includes("/api/places/")) placesCalls++; });
    await page.goto("/assistant");
    await page.getByRole("textbox", { name: /What kind of cafe/ }).fill("Find a quiet cafe with Wi-Fi under $5 near me.");
    await page.getByRole("button", { name: "Search with assistant" }).click();
    await expect(page.getByRole("log")).toContainText("won't guess your location");
    expect(placesCalls).toBe(0);
    await expect(page.getByRole("region", { name: "Interpreted search" })).toContainText("Location needed");
  });
  test("AI failure keeps regular search usable", async ({ page }) => {
    await page.route("**/api/assistant", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable" } }) }));
    await page.goto("/assistant");
    await page.getByRole("textbox", { name: /What kind of cafe/ }).fill("Show cafes in BKK1.");
    await page.getByRole("button", { name: "Search with assistant" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "couldn't complete" })).toBeVisible();
    await page.getByRole("link", { name: "Use regular search filters" }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.getByRole("button", { name: "Find My Cafe" })).toBeVisible();
  });
});
