import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  { name: "home", path: "/" },
  { name: "discover (idle)", path: "/discover" },
  { name: "discover (results)", path: "/discover?area=bkk1&purpose=work&radius=3000&wifi=1" },
  { name: "discover (empty)", path: "/discover?area=koh-pich&purpose=date&radius=1000&rating=4.5" },
];

for (const { name, path } of PAGES) {
  test(`${name} has no detectable WCAG A/AA violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (path.includes("area=")) {
      // Scan the settled results state, not the loading skeleton.
      await expect(page.getByTestId("results-skeleton")).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 2 }).first()).not.toHaveText("Searching…");
    }

    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(
      violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })),
    ).toEqual([]);
  });
}
