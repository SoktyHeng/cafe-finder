import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { GOOGLE_DETAILS, PNG } from "./fixtures/details";

const routes = [
  ["home", "/"],
  ["discovery-idle", "/discover"],
  ["discovery-results", "/discover?area=bkk1&purpose=work&radius=3000"],
  ["discovery-empty", "/discover?area=koh-pich&purpose=date&radius=1000&rating=4.5"],
  ["details", "/cafes/fixture-001"],
  ["details-google", "/cafes/ChIJmockDetails01"],
  ["favorites", "/favorites"],
  ["login", "/login"],
  ["account", "/account"],
  ["assistant", "/assistant"],
  ["guidelines", "/community-guidelines"],
  ["moderation", "/moderation"],
  ["not-found", "/this-page-does-not-exist"],
] as const;

for (const width of [375, 768, 1024, 1440]) {
  test.describe(`responsive audit at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const [name, url] of routes) {
      test(`${name}: accessible and no overflow`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix runs once per width");
        if (name === "details-google") {
          await page.route("**/api/places/ChIJmockDetails01", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GOOGLE_DETAILS) }));
          await page.route("**/api/places/photo?**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
        }
        await page.goto(url);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (name === "discovery-results") await expect(page.getByRole("article").first()).toBeVisible();
        if (name === "details") await expect(page.getByTestId("demo-details-notice")).toBeVisible();
        if (name === "details-google") await expect(page.getByRole("heading", { name: "Photos", exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true });
      });
    }
  });
}
