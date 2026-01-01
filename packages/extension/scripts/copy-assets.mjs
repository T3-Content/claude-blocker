import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");

// Ensure dist exists
mkdirSync(dist, { recursive: true });

// Files to copy
const files = [
  "src/popup.html",
  "src/popup.css",
  "src/options.html",
  "src/options.css",
  "manifest.json",
];

for (const file of files) {
  const src = join(root, file);
  const destName = file.includes("/") ? file.split("/").pop() : file;
  const dest = join(dist, destName);
  copyFileSync(src, dest);
  console.log(`Copied ${file} → dist/${destName}`);
}
