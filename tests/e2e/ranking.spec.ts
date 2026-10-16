import { expect, test, type Page } from "@playwright/test";

/** Ranking, match explanations and empty-state relaxation against the fixture server. */

const cards = (page: Page) =>
  page.getByRole("list", { name: "Cafes, best match first" }).getByRole("article");

test("results are ranked with match percentages and evidence-backed explanations", async ({ page }) => {
  await page.goto("/discover?area=bkk1&purpose=work&radius=3000&wifi=1");

  const first = cards(page).first();
  await expect(first).toBeVisible();
  await expect(first.getByText("Best match")).toBeVisible();
  await expect(first.getByTestId("match-badge")).toHaveText(/^\d{1,3}% match(High|Medium) confidence$/);

  // Percentages never increase down the list (whenever shown).
  const badges = await cards(page).getByTestId("match-badge").allTextContents();
  const percents = badges.map((text) => text.match(/^(\d+)%/)?.[1]).filter(Boolean).map(Number);
  expect(percents.length).toBeGreaterThan(1);
  expect(percents).toEqual([...percents].sort((a, b) => b - a));

  // Wi-Fi is never claimed; it is listed as not verified.
  await expect(first.getByRole("list", { name: "Why it matches" })).not.toContainText(/wi-?fi/i);
  await expect(first.getByRole("list", { name: "Preferences not verified" })).toContainText("Wi-Fi");

  await first.getByText("How this match is calculated").click();
  const table = first.getByRole("table", { name: "Score breakdown" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("rowheader")).toHaveText([
    "Rating",
    "Distance",
    "Open now",
    "Atmosphere for your purpose",
    "Wi-Fi / quiet",
  ]);
});

test("a cafe with thin data shows 'Limited data' rather than a percentage", async ({ page }) => {
  await page.goto("/discover?area=bkk1&purpose=work&radius=1000");
  const sparse = page.getByRole("article", { name: "Minimal Demo Kiosk" });
  await expect(sparse.getByTestId("match-badge")).toHaveText("Limited data");
});

test("empty results offer one-click relaxation that runs a new search", async ({ page }) => {
  await page.goto("/discover?area=koh-pich&purpose=date&radius=1000&rating=4.5");
  await expect(page.getByRole("heading", { name: /No cafes found within 1 km of Koh Pich/ })).toBeVisible();

  const options = page.getByRole("list", { name: "Ways to widen your search" });
  await options.getByRole("button", { name: "Include 1 cafe rated below 4.5" }).click();

  await expect(page).not.toHaveURL(/rating=/);
  await expect(page.getByRole("article", { name: "Island Breeze Demo Cafe" })).toBeVisible();
});

test("widening the radius is offered and applied", async ({ page }) => {
  await page.goto("/discover?area=koh-pich&purpose=date&radius=1000&rating=4.5");
  await page.getByRole("button", { name: "Search within 3 km" }).click();
  await expect(page).toHaveURL(/radius=3000/);
  await expect(page.getByRole("heading", { name: /within 3 km of Koh Pich/ })).toBeVisible();
});
