import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const width of [375, 768, 1024, 1440]) {
  test(`sign-in and registration UI at ${width}px`, async ({ page }, testInfo) => {
    test.skip(!testInfo.config.configFile?.endsWith("playwright.auth.config.ts"), "Configured signed-out UI suite only");
    await page.setViewportSize({ width, height: 900 });
    await page.route("https://cafe-finder-ui.invalid/**", (route) => route.abort());
    await page.goto("/login?next=%2Ffavorites");
    const form = page.getByRole("form", { name: "Sign in", exact: true });
    await expect(form).toBeVisible();
    await form.getByLabel("Password", { exact: true }).fill("test-only-password");
    await form.getByRole("button", { name: "Show password", exact: true }).click();
    await expect(form.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
    await form.getByRole("button", { name: "Hide password", exact: true }).click();
    await expect(form.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
    await form.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(form.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("group", { name: "Account", exact: true }).getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();
    await expect(page.getByLabel(/Name.*optional/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`registration-${width}.png`), fullPage: true });
  });
}
