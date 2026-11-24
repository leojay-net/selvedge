import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHROME_EXECUTABLE = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT = { width: 1440, height: 900 };
const PAGE_SETTLE_MILLISECONDS = 6000;
const demoDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = join(demoDirectory, "build");
mkdirSync(outputDirectory, { recursive: true });

const latestRun = JSON.parse(readFileSync(resolve(demoDirectory, "../docs/devnet-agent-run.json"), "utf8")).runs.at(-1).results;
const targets = [
  { name: "explorer-payment", signature: latestRun.honestRun.containment.find((event) => event.outcome === "allowed").signature },
  { name: "explorer-refusal", signature: latestRun.injectionRefusedByProgram.containment.find((event) => event.outcome === "refused").signature },
  { name: "explorer-revoke", signature: latestRun.injectionRefusedByProgram.containment.find((event) => event.outcome === "revoked").signature },
];

const browser = await chromium.launch({ executablePath: CHROME_EXECUTABLE });
const page = await browser.newPage({ viewport: VIEWPORT });
for (const target of targets) {
  await page.goto(`https://explorer.solana.com/tx/${target.signature}?cluster=devnet`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(PAGE_SETTLE_MILLISECONDS);
  await page.screenshot({ path: join(outputDirectory, `${target.name}.png`) });
  process.stdout.write(`${target.name} ${target.signature}\n`);
}
await browser.close();
