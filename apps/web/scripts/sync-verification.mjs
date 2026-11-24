import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(webDirectory, "..", "..", "docs", "VERIFICATION.md");
const targetPath = join(webDirectory, "content", "verification.md");

mkdirSync(dirname(targetPath), { recursive: true });
if (existsSync(sourcePath)) {
  copyFileSync(sourcePath, targetPath);
  console.log("verification: copied docs/VERIFICATION.md");
} else {
  rmSync(targetPath, { force: true });
  console.log("verification: docs/VERIFICATION.md not found, the proofs page will show its empty state");
}
