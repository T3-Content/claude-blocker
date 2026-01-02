import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const target = process.argv[2];
if (!['chrome', 'firefox'].includes(target)) {
  console.error('Usage: node build.mjs <chrome|firefox>');
  process.exit(1);
}

const distDir = join(rootDir, `dist-${target}`);
mkdirSync(distDir, { recursive: true });

// Load and merge manifests
const base = JSON.parse(readFileSync(join(rootDir, 'manifest/base.json'), 'utf8'));
const override = JSON.parse(readFileSync(join(rootDir, `manifest/${target}.json`), 'utf8'));
const manifest = { ...base, ...override };

// Write merged manifest
writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Created manifest.json for ${target}`);

// Copy static assets
const assets = ['popup.html', 'popup.css', 'options.html', 'options.css'];
for (const asset of assets) {
  const srcPath = join(rootDir, 'src', asset);
  if (existsSync(srcPath)) {
    copyFileSync(srcPath, join(distDir, asset));
    console.log(`Copied ${asset}`);
  }
}

console.log(`Build complete for ${target} -> dist-${target}/`);
