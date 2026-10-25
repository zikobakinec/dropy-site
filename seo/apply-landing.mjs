// Re-applies the landing blocks cached by generate.mjs (seo/landing.json) to
// /index.html. Run after every `vite build` in web/, which rewrites index.html
// from web/index.html with empty markers.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyLanding } from "./generate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheFile = join(ROOT, "seo", "landing.json");
if (!existsSync(cacheFile)) {
  console.error("seo/landing.json missing — run `node seo/generate.mjs` once first");
  process.exit(1);
}
const indexFile = join(ROOT, "index.html");
writeFileSync(indexFile, applyLanding(readFileSync(indexFile, "utf8"), JSON.parse(readFileSync(cacheFile, "utf8"))));
console.log("landing blocks applied");
