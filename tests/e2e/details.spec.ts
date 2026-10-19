import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { GOOGLE_DETAILS, PNG } from "./fixtures/details";

const A11Y_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(A11Y_TAGS).analyze();
  expect(violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
}

test.describe("cafe details (fixture mode)", () => {
  test("opens from results, labels demo data, and links back to the same search", async ({ page }) => {
    const query = "area=bkk1&purpose=work&radius=3000";
    await page.goto(`/discover?${query}`);
    const card = page.getByRole("article", { name: "Lantern Bean Demo Cafe" });
    await card.getByRole("link", { name: /details/i }).click();

    await expect(page).toHaveURL(/\/cafes\/fixture-001\?from=/);
    await expect(page.getByRole("heading", { level: 1, name: "Lantern Bean Demo Cafe" })).toBeVisible();
    await expect(page.getByTestId("demo-details-notice")).toBeVisible();
    await expect(page.getByText(/from Boeung Keng Kang 1 \(BKK1\) \(straight line\)/)).toBeVisible();
    await expect(page.getByRole("link", { name: /directions/i })).toHaveCount(0);
    await expect(page.getByText("Opening hours unknown.")).toBeVisible();

    await page.getByRole("link", { name: "Back to results" }).click();
    await expect(page).toHaveURL(`/discover?${query}`);
    await expect(page.getByRole("article", { name: "Lantern Bean Demo Cafe" })).toBeVisible();
  });

  test("unknown cafes show a not-found state", async ({ page }) => {
    await page.goto("/cafes/ChIJdoesNotExist000");
    await expect(page.getByRole("heading", { name: /couldn.t find that cafe/i })).toBeVisible();
  });

  test("details page is accessible", async ({ page }) => {
    await page.goto("/cafes/fixture-001");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe("cafe details (mocked Google data)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/places/ChIJmockDetails01", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GOOGLE_DETAILS) }),
    );
    await page.route("**/api/places/photo?**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PNG }),
    );
  });

  test("shows photos with credits, hours, amenities, reviews and Google links", async ({ page }) => {
    const photoRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/places/photo")) photoRequests.push(request.url());
    });
    await page.goto("/cafes/ChIJmockDetails01");

    await expect(page.getByRole("heading", { level: 1, name: "Mocked Google Cafe" })).toBeVisible();
    await expect(page.getByTestId("google-maps-attribution")).toHaveText("Google Maps");

    // One photo (one billable request) until the user asks for more.
    const photos = page.getByRole("list", { name: "Photos" });
    await expect(photos.getByRole("img")).toHaveCount(1);
    await expect(photos.getByRole("link", { name: "Mock Photographer" })).toBeVisible();
    expect(photoRequests).toHaveLength(1);
    await page.getByRole("button", { name: "Show 1 more photo" }).click();
    await expect(photos.getByRole("img")).toHaveCount(2);
    await expect(photos.getByText("Second Photographer")).toBeVisible();

    await expect(page.getByRole("list", { name: "Opening hours" }).getByRole("listitem")).toHaveCount(7);
    await expect(page.locator("[aria-current=date]")).toHaveCount(1);

    const amenities = page.getByRole("list", { name: "Amenities according to Google" });
    await expect(amenities).toContainText("Dine-in");
    await expect(amenities).not.toContainText(/wi-?fi/i);

    const reviews = page.getByRole("list", { name: "Google reviews" });
    await expect(reviews.getByRole("link", { name: "Mock Reviewer" })).toHaveAttribute("href", "https://www.google.com/maps/contrib/9");
    await expect(reviews).toContainText("Mocked review text.");

    await expect(page.getByRole("link", { name: /directions/i })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/dir/?api=1&destination=Mocked+Google+Cafe&destination_place_id=ChIJmockDetails01",
    );
    await expect(page.getByRole("link", { name: /open in google maps/i })).toHaveAttribute("href", "https://maps.google.com/?cid=42");
  });

  test("Google details page is accessible", async ({ page }) => {
    await page.goto("/cafes/ChIJmockDetails01");
    await expect(page.getByRole("list", { name: "Google reviews" })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("upstream failure shows an error with retry", async ({ page }) => {
    await page.unroute("**/api/places/ChIJmockDetails01");
    let fail = true;
    await page.route("**/api/places/ChIJmockDetails01", (route) => {
      if (fail) {
        fail = false;
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE", message: "x" } }),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GOOGLE_DETAILS) });
    });
    await page.goto("/cafes/ChIJmockDetails01");
    await expect(page.locator("[data-slot=alert]")).toContainText("temporarily unavailable");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Mocked Google Cafe" })).toBeVisible();
  });
});

test.describe("map fallback without a browser key", () => {
  test("wide screens show the list beside a 'map not available' panel", async ({ page, isMobile }) => {
    test.skip(isMobile, "Desktop layout");
    await page.goto("/discover?area=bkk1&purpose=work&radius=3000");
    await expect(page.getByTestId("map-unavailable")).toBeVisible();
    await expect(page.getByTestId("map-unavailable")).toHaveAttribute("data-reason", "not-configured");
    await expect(page.getByRole("list", { name: /Cafes, best match first/ }).getByRole("article").first()).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("small screens toggle between list and map without breaking the list", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile layout");
    await page.goto("/discover?area=bkk1&purpose=work&radius=3000");
    const list = page.getByRole("list", { name: /Cafes, best match first/ });
    await expect(list.getByRole("article").first()).toBeVisible();
    await expect(page.getByTestId("map-unavailable")).toHaveCount(0);

    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.getByTestId("map-unavailable")).toBeVisible();
    await expect(list).toBeHidden();

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(list.getByRole("article").first()).toBeVisible();
  });

  test("Maps JavaScript API is never requested without a key", async ({ page }) => {
    const mapsRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("maps.googleapis.com")) mapsRequests.push(request.url());
    });
    await page.goto("/discover?area=bkk1&purpose=work&radius=3000");
    await expect(page.getByRole("list", { name: /Cafes, best match first/ }).getByRole("article").first()).toBeVisible();
    expect(mapsRequests).toEqual([]);
  });
});
