import { expect, test, type Page } from "@playwright/test";

const NEARBY_API = "**/api/places/nearby";

/** Counts calls to the search API made by the page. */
function countSearchRequests(page: Page) {
  const counter = { count: 0 };
  page.on("request", (request) => {
    if (request.url().includes("/api/places/nearby")) {
      counter.count += 1;
    }
  });
  return counter;
}

const results = (page: Page) => page.getByRole("list", { name: "Cafes" }).getByRole("article");

test.describe("discovery flow", () => {
  test("location denied: manual area search completes the flow", async ({ page, context }) => {
    await context.clearPermissions();
    const searches = countSearchRequests(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByText(/location access was blocked/i)).toBeVisible();

    await page.getByRole("searchbox").fill("bkk");
    await page.getByRole("button", { name: /BKK1/ }).click();
    await expect(page.getByTestId("selected-location")).toContainText("BKK1");
    await page.getByRole("radio", { name: "Work / Study" }).check({ force: true });

    expect(searches.count).toBe(0);
    await page.getByRole("button", { name: "Find My Cafe" }).click();

    await expect(page).toHaveURL(/\/discover\?area=bkk1&purpose=work&radius=3000$/);
    await expect(page.getByRole("heading", { name: /cafes within 3 km of Boeung Keng Kang 1/ })).toBeVisible();
    await expect(results(page).first()).toBeVisible();
    await expect(results(page).first()).toContainText("Demo data");
    await expect(page.getByText("Demo mode: these cafes are fictional.")).toBeVisible();
    expect(searches.count).toBe(1);
  });

  test("location granted: searches near a rounded device position", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 11.5564321, longitude: 104.9281987, accuracy: 30 });
    await page.goto("/");

    await page.getByRole("button", { name: "Use my current location" }).click();
    await expect(page.getByTestId("selected-location")).toContainText("your current location");
    await page.getByRole("button", { name: "Find My Cafe" }).click();

    await expect(page).toHaveURL(/lat=11\.556&lng=104\.928/);
    await expect(page.getByRole("heading", { name: /within 3 km of your current location/ })).toBeVisible();
    await expect(results(page).first()).toBeVisible();
  });

  test("editing controls never triggers a search; only submit does", async ({ page }) => {
    await page.goto("/discover?area=riverside&purpose=work&radius=3000");
    await expect(results(page).first()).toBeVisible();

    const searches = countSearchRequests(page);
    const settings = page.getByRole("complementary", { name: "Search settings" });
    if (await page.getByRole("button", { name: "Edit search" }).isVisible()) {
      await page.getByRole("button", { name: "Edit search" }).click();
    }
    await settings.getByRole("radio", { name: "Date" }).check({ force: true });
    await settings.getByRole("slider", { name: "Distance" }).fill("5000");
    await settings.getByRole("combobox", { name: "Minimum rating" }).selectOption("4");
    await settings.getByRole("checkbox", { name: "Open now only" }).check();
    await page.waitForTimeout(500);
    expect(searches.count).toBe(0);

    await settings.getByRole("button", { name: "Find My Cafe" }).click();
    await expect(page).toHaveURL(/purpose=date&radius=5000&rating=4&open=1/);
    await expect(page.getByRole("heading", { name: /within 5 km of Riverside/ })).toBeVisible();
    expect(searches.count).toBe(1);
  });

  test("unknown values are labelled, not hidden or invented", async ({ page }) => {
    await page.goto("/discover?area=bkk1&purpose=work&radius=1000&rating=4.5&open=1&wifi=1");

    const unrated = page.getByRole("article", { name: "New Demo Cafe (no ratings yet)" });
    await expect(unrated).toContainText("No rating yet");
    const unknownHours = page.getByRole("article", { name: "Minimal Demo Kiosk" });
    await expect(unknownHours).toContainText("Opening hours unknown");
    await expect(unknownHours).toContainText("No rating yet");
    await expect(unknownHours).toContainText("away (straight line)");
    await expect(results(page).first()).toContainText("Wi-Fi");
    await expect(page.getByText(/Hidden by your filters: 1 cafe permanently closed/)).toBeVisible();
  });

  test("empty results explain why and offer to edit the search", async ({ page }) => {
    await page.goto("/discover?area=koh-pich&purpose=date&radius=1000&rating=4.5");

    await expect(page.getByRole("heading", { name: /No cafes found within 1 km of Koh Pich/ })).toBeVisible();
    await expect(page.getByText("Hidden by your filters: 1 cafe rated below 4.5.")).toBeVisible();
    await page.getByRole("button", { name: "Edit search" }).last().click();
    await expect(
      page.getByRole("complementary", { name: "Search settings" }).getByRole("button", { name: "Find My Cafe" }),
    ).toBeVisible();
  });

  test("API failure shows an error with a working retry", async ({ page }) => {
    let failNext = true;
    await page.route(NEARBY_API, async (route) => {
      if (failNext) {
        failNext = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable" },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/discover?area=bkk1&purpose=work&radius=3000");
    await expect(page.locator("[data-slot=alert]")).toContainText("temporarily unavailable");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(results(page).first()).toBeVisible();
  });

  test("rate limiting is explained", async ({ page }) => {
    await page.route(NEARBY_API, (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "RATE_LIMITED", message: "Slow down" } }),
      }),
    );
    await page.goto("/discover?area=bkk1&purpose=work&radius=3000");
    await expect(page.locator("[data-slot=alert]")).toContainText("Too many searches");
  });

  test("an invalid link is reset and does not search", async ({ page }) => {
    const searches = countSearchRequests(page);
    await page.goto("/discover?area=atlantis&radius=99999");

    await expect(page.getByText(/not valid and have been reset/)).toBeVisible();
    await page.waitForTimeout(500);
    expect(searches.count).toBe(0);
  });

  test("keyboard only: pick an area and search", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox").focus();
    await page.keyboard.type("river");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("selected-location")).toContainText("Riverside");

    const submit = page.getByRole("button", { name: "Find My Cafe" });
    for (let step = 0; step < 40 && !(await submit.evaluate((el) => el === document.activeElement)); step++) {
      await page.keyboard.press("Tab");
    }
    await expect(submit).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/area=riverside/);
    await expect(results(page).first()).toBeVisible();
  });
});

test.describe("mobile layout", () => {
  test("results come first and settings toggle open", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile-only behaviour");
    await page.goto("/discover?area=bkk1&purpose=work&radius=3000");

    await expect(results(page).first()).toBeVisible();
    const toggle = page.getByRole("button", { name: "Edit search" }).first();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const settings = page.getByRole("complementary", { name: "Search settings" });
    await expect(settings.getByRole("button", { name: "Find My Cafe" })).toBeHidden();

    await toggle.click();
    await expect(page.getByRole("button", { name: "Hide search settings" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(settings.getByRole("button", { name: "Find My Cafe" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
