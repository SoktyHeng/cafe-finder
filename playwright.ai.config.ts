import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const port = 3101;
export default defineConfig({
  ...base,
  testMatch: "assistant.spec.ts",
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  webServer: {
    ...base.webServer,
    command: `pnpm build && pnpm start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: { ...(!Array.isArray(base.webServer) && base.webServer ? base.webServer.env : {}), ENABLE_AI: "true", AI_PROVIDER: "fixture", NEXT_PUBLIC_APP_URL: `http://localhost:${port}`, AI_RATE_LIMIT_PER_MINUTE: "60", AI_GLOBAL_RATE_LIMIT_PER_MINUTE: "1000" },
  },
});
