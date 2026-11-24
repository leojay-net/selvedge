import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PUBLIC_PATHS = ["/", "/agents", "/activity", "/containment", "/proofs"] as const;

for (const path of PUBLIC_PATHS) {
  test(`${path} loads without a login and passes axe`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Selvedge home" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
}

test("the overview reads the deployed program from devnet", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Deployed", { exact: true })).toBeVisible();
});
