import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const brandDirectory = dirname(fileURLToPath(import.meta.url));
const assetsDirectory = resolve(brandDirectory, "..");
const webDirectory = resolve(assetsDirectory, "..", "apps", "web");
const requireFromWeb = createRequire(join(webDirectory, "package.json"));
const { chromium } = requireFromWeb("@playwright/test");

const PRIMARY = "#1E3A5F";
const ON_PRIMARY = "#FFFFFF";
const NEUTRAL_900 = "#1B1A17";
const MARK_SIZE = 48;
const WORDMARK_GAP = 14;
const WORDMARK_BASELINE = 33;
const LOGO_PADDING = 2;
const FAVICON_SIZES = [16, 32, 48, 180, 192, 512];
const ICO_SIZES = [16, 32, 48];

const wordmark = JSON.parse(readFileSync(join(brandDirectory, "wordmark.json"), "utf8"));

function markBody() {
  const warpLines = [11, 19, 27, 35]
    .map((x) => `<path d="M${x} 7V41" stroke="${ON_PRIMARY}" stroke-opacity="0.38" stroke-width="2" stroke-linecap="round"/>`)
    .join("");
  const weft =
    `<path d="M10 14H36A4 4 0 0 1 36 22H12A4 4 0 0 0 12 30H36A4 4 0 0 1 36 38H10" fill="none" stroke="${ON_PRIMARY}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<rect width="${MARK_SIZE}" height="${MARK_SIZE}" rx="10" fill="${PRIMARY}"/>${warpLines}${weft}`;
}

function markSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}" width="${MARK_SIZE}" height="${MARK_SIZE}" role="img" aria-label="Selvedge">${markBody()}</svg>\n`;
}

function logoSvg(textColor) {
  const width = MARK_SIZE + WORDMARK_GAP + wordmark.width + LOGO_PADDING * 2;
  const height = MARK_SIZE + LOGO_PADDING * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height}" width="${width.toFixed(0)}" height="${height}" role="img" aria-label="Selvedge"><g transform="translate(${LOGO_PADDING} ${LOGO_PADDING})">${markBody()}</g><path transform="translate(${MARK_SIZE + WORDMARK_GAP + LOGO_PADDING} ${WORDMARK_BASELINE + LOGO_PADDING})" d="${wordmark.pathData}" fill="${textColor}"/></svg>\n`;
}

async function renderPng(browser, svgText, size, outputPath) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svgText.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`);
  await page.screenshot({ path: outputPath, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}

function buildIco(pngBuffers, sizes) {
  const headerSize = 6;
  const entrySize = 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngBuffers.length, 4);
  let offset = headerSize + entrySize * pngBuffers.length;
  const entries = pngBuffers.map((png, index) => {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(sizes[index], 0);
    entry.writeUInt8(sizes[index], 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

async function main() {
  const mark = markSvg();
  writeFileSync(join(assetsDirectory, "logo-mark.svg"), mark);
  writeFileSync(join(assetsDirectory, "logo.svg"), logoSvg(NEUTRAL_900));
  writeFileSync(join(assetsDirectory, "logo-on-dark.svg"), logoSvg(ON_PRIMARY));
  writeFileSync(join(assetsDirectory, "favicon.svg"), mark);
  writeFileSync(join(webDirectory, "public", "favicon.svg"), mark);
  writeFileSync(join(webDirectory, "public", "logo-mark.svg"), mark);
  writeFileSync(join(webDirectory, "public", "logo.svg"), logoSvg(NEUTRAL_900));

  const browser = await chromium.launch();
  const pngBySize = new Map();
  for (const size of FAVICON_SIZES) {
    const outputPath = join(assetsDirectory, `favicon-${size}.png`);
    await renderPng(browser, mark, size, outputPath);
    pngBySize.set(size, readFileSync(outputPath));
  }
  writeFileSync(join(assetsDirectory, "favicon.ico"), buildIco(ICO_SIZES.map((size) => pngBySize.get(size)), ICO_SIZES));
  writeFileSync(join(webDirectory, "public", "favicon.ico"), readFileSync(join(assetsDirectory, "favicon.ico")));
  writeFileSync(join(webDirectory, "public", "apple-touch-icon.png"), pngBySize.get(180));
  writeFileSync(join(webDirectory, "public", "icon-192.png"), pngBySize.get(192));
  writeFileSync(join(webDirectory, "public", "icon-512.png"), pngBySize.get(512));

  const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
  await page.goto(pathToFileURL(join(brandDirectory, "banner.html")).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(assetsDirectory, "banner.png") });
  await browser.close();
}

await main();
