import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Production build in fixture mode: no Google or Supabase keys are needed.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      PLACES_PROVIDER: "fixture",
      NEXT_PUBLIC_APP_URL: baseURL,
      // All tests share one client; production defaults would throttle the suite.
      DISCOVERY_RATE_LIMIT_PER_MINUTE: "10000",
      PLACE_DETAILS_RATE_LIMIT_PER_MINUTE: "10000",
      PLACE_PHOTOS_RATE_LIMIT_PER_MINUTE: "10000",
      PLACES_GLOBAL_RATE_LIMIT_PER_MINUTE: "10000",
      // No browser key: the Maps JavaScript API is never loaded in tests, and
      // the map fallback is exercised. Live maps are verified manually.
      NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: "",
    },
  },
});
