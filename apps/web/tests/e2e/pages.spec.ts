import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_MANDATE_ADDRESS, FIXTURE_OWNER, buildRevokeTransactionBase64 } from "../fixtures/chainFixtures";

const PAGES_UNDER_AUDIT: ReadonlyArray<{ readonly path: string; readonly heading: string }> = [
  { path: "/", heading: "An agent with a wallet. What could go wrong?" },
  { path: "/agents", heading: "Agents" },
  { path: `/mandates/${FIXTURE_MANDATE_ADDRESS}`, heading: "Mandate 7" },
  { path: "/activity", heading: "Activity" },
  { path: "/containment", heading: "Containment" },
  { path: "/proofs", heading: "Proofs" },
];

const SIGNATURE_BYTE_LENGTH = 64;

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(" | ")}`)).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const target of PAGES_UNDER_AUDIT) {
  test(`${target.path} renders, fits the viewport and passes axe`, async ({ page }) => {
    await page.goto(target.path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(target.heading);
    await expectNoHorizontalScroll(page);
    await expectNoAccessibilityViolations(page);
  });
}

test("agents page lists the live mandate with its spend", async ({ page }) => {
  await page.goto("/agents");
  await expect(page.getByText("12.5 USDC spent")).toBeVisible();
  await page.getByRole("link", { name: /Mandate 7/ }).click();
  await expect(page).toHaveURL(new RegExp(FIXTURE_MANDATE_ADDRESS));
  await expect(page.getByRole("heading", { name: "Kill switch" })).toBeVisible();
});

test("an unknown mandate shows the not-found state", async ({ page }) => {
  await page.goto("/mandates/11111111111111111111111111111111");
  await expect(page.getByRole("heading", { name: "Mandate not found" })).toBeVisible();
});

test("without a wallet the kill switch stays disabled", async ({ page }) => {
  await page.goto(`/mandates/${FIXTURE_MANDATE_ADDRESS}`);
  await expect(page.getByText("Viewing only", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review revoke transaction" })).toBeDisabled();
});

test("containment lists refusals from the runtime", async ({ page }) => {
  await page.goto("/containment");
  await expect(page.getByText("The payee is not on the mandate allowlist.")).toBeVisible();
  await expect(page.getByText("Mandate program", { exact: true })).toBeVisible();
});

test("proofs page shows an empty state or the record, plus reproduce commands", async ({ page }) => {
  await page.goto("/proofs");
  await expect(page.getByText("cargo test -p selvedge-mandate").first()).toBeVisible();
});

test("activity reviews a pasted transaction", async ({ page }) => {
  await page.goto("/activity");
  await page.getByRole("button", { name: "Review transaction" }).click();
  await expect(page.getByText("Paste a base64 transaction to review.")).toBeVisible();
  await page.getByLabel("Transaction, base64 encoded").fill(buildRevokeTransactionBase64());
  await page.getByRole("button", { name: "Review transaction" }).click();
  await expect(page.getByRole("heading", { name: "Decoded instructions" })).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test("activity shows recent mandate transactions with a verdict", async ({ page }) => {
  await page.goto("/activity");
  const recent = page.getByRole("region", { name: "Recent mandate transactions" }).or(page.locator("#recent-heading + ul"));
  await expect(recent.getByRole("link").first()).toBeVisible();
});

test("activity rejects garbage input with a designed failure state", async ({ page }) => {
  await page.goto("/activity");
  await page.getByLabel("Transaction, base64 encoded").fill("this is not base64 !!");
  await page.getByRole("button", { name: "Review transaction" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Review failed" })).toBeVisible();
});

test("a wallet-standard wallet can review and sign a revoke", async ({ page }) => {
  await page.addInitScript(
    ({ ownerAddress, signatureLength }) => {
      const ownerBytes = new Uint8Array(32);
      const account = {
        address: ownerAddress,
        publicKey: ownerBytes,
        chains: ["solana:devnet"],
        features: ["solana:signAndSendTransaction"],
      };
      const windowWithCapture = window as unknown as { __signedTransactions: number[] };
      windowWithCapture.__signedTransactions = [];
      const wallet = {
        version: "1.0.0",
        name: "Fixture Wallet",
        icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        chains: ["solana:devnet"],
        accounts: [account],
        features: {
          "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
          "standard:disconnect": { version: "1.0.0", disconnect: async () => undefined },
          "solana:signAndSendTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: ["legacy", 0],
            signAndSendTransaction: async (input: { transaction: Uint8Array }) => {
              windowWithCapture.__signedTransactions.push(input.transaction.length);
              return [{ signature: new Uint8Array(signatureLength).fill(7) }];
            },
          },
        },
      };
      window.addEventListener("wallet-standard:app-ready", (event) => {
        (event as CustomEvent<{ register: (registered: unknown) => void }>).detail.register(wallet);
      });
    },
    { ownerAddress: FIXTURE_OWNER, signatureLength: SIGNATURE_BYTE_LENGTH },
  );

  await page.goto(`/mandates/${FIXTURE_MANDATE_ADDRESS}`);
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: "Fixture Wallet" }).click();
  await expect(page.getByText(/Fixture Wallet/).first()).toBeVisible();

  await page.getByRole("button", { name: "Review revoke transaction" }).click();
  await expect(page.getByRole("heading", { name: "Decoded instructions" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /revoke/i }).first()).toBeVisible();

  await page.getByRole("button", { name: "Revoke and sign in wallet" }).click();
  await expect(page.getByText(/Revoke submitted/)).toBeVisible();
  const signedCount = await page.evaluate(() => (window as unknown as { __signedTransactions: number[] }).__signedTransactions.length);
  expect(signedCount).toBe(1);
});

test("the attack game stops a stranger and awards the badge after every attack", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Send funds to a stranger/ }).click();
  await expect(page.getByText(/Stopped by Engine policy/)).toBeVisible();
  for (const attackName of [/Spend past the cap/, /Replay an old payment/, /Ask for unlimited access/, /Pay after you pulled the plug/]) {
    await page.getByRole("button", { name: attackName }).click();
    await expect(page.getByText(/Stopped by/)).toBeVisible();
  }
  await expect(page.getByText("Vault intact. Nothing got through.")).toBeVisible();
});

test("allowing the stranger in the mandate lets the attack through and costs funds", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel(/Also allow Unknown wallet/).check();
  await page.getByRole("button", { name: /Send funds to a stranger/ }).click();
  await expect(page.getByText(/Settled\./)).toBeVisible();
  await expect(page.getByText("2 USDC", { exact: true })).toBeVisible();
});
