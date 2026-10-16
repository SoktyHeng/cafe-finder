import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * The UI with Google-sourced results. The browser-facing API is mocked with
 * the normalized DTO, so no Google request is ever made from tests.
 */
const GOOGLE_RESPONSE = {
  results: [
    {
      placeId: "ChIJtestPlace0001",
      name: "Sample Google-sourced Cafe",
      latitude: 11.5551,
      longitude: 104.9262,
      address: "Test address (mocked response)",
      rating: 4.5,
      ratingCount: 87,
      openNow: true,
      businessStatus: "operational",
      googleMapsUri: "https://maps.google.com/?cid=1234567890",
      distanceMeters: 260,
      dataSource: "google",
    },
    {
      placeId: "ChIJtestPlace0002",
      name: "Second Mocked Cafe",
      distanceMeters: 900,
      dataSource: "google",
    },
  ],
  searchedAt: "2026-10-16T00:00:00.000Z",
  source: "google",
  coverageNote: "Results are a subset of nearby cafes, not an exhaustive list.",
  excluded: { belowMinRating: 0, closedNow: 0, permanentlyClosed: 0 },
  attributions: [{ provider: "Example Data Provider" }],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/places/nearby", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GOOGLE_RESPONSE) }),
  );
});

test("Google results show attribution, sources and Maps links", async ({ page }) => {
  await page.goto("/discover?area=bkk1&purpose=work&radius=3000");

  const attribution = page.getByTestId("google-maps-attribution");
  await expect(attribution).toHaveText("Google Maps · Data: Example Data Provider");
  await expect(attribution.getByText("Google Maps")).toHaveAttribute("translate", "no");
  await expect(page.getByText(/hours can change/i)).toBeVisible();
  await expect(page.getByTestId("demo-results-notice")).toHaveCount(0);

  const first = page.getByRole("article", { name: "Sample Google-sourced Cafe" });
  await expect(first).toContainText("4.5 Google rating from 87 reviews");
  await expect(first).toContainText("Open now (according to Google)");
  await expect(first).not.toContainText("Demo data");
  await expect(first.getByRole("link", { name: /open in google maps/i })).toHaveAttribute(
    "href",
    "https://maps.google.com/?cid=1234567890",
  );

  const sparse = page.getByRole("article", { name: "Second Mocked Cafe" });
  await expect(sparse).toContainText("No rating yet");
  await expect(sparse).toContainText("Opening hours unknown");
  await expect(sparse.getByRole("link")).toHaveCount(0);
});

test("Google results page has no detectable WCAG A/AA violations", async ({ page }) => {
  await page.goto("/discover?area=bkk1&purpose=work&radius=3000");
  await expect(page.getByTestId("google-maps-attribution")).toBeVisible();

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
});
