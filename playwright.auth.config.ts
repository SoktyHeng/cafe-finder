import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = 3102;
export default defineConfig({
  ...base,
  testMatch: "auth-design.spec.ts",
  outputDir: "test-results-auth",
  projects: base.projects?.filter((project) => project.name === "desktop-chromium"),
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  webServer: {
    ...base.webServer,
    command: `pnpm build && pnpm start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: {
      ...(!Array.isArray(base.webServer) && base.webServer ? base.webServer.env : {}),
      NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
      // Public, deliberately nonfunctional configuration to render signed-out UI.
      // No real credentials, accounts or authentication requests are used.
      NEXT_PUBLIC_SUPABASE_URL: "https://cafe-finder-ui.invalid",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ui_test_only",
    },
  },
});
