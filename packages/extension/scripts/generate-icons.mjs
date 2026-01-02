import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, '..', 'icon.svg');

// Support target argument: chrome, firefox, or default to 'dist'
const target = process.argv[2];
const distFolder = target ? `dist-${target}` : 'dist';
const distPath = join(__dirname, '..', distFolder);

const sizes = [16, 32, 48, 128];

const baseSvg = readFileSync(svgPath, 'utf8');

// Light version: white icon (for dark backgrounds / browser toolbar)
const lightSvg = baseSvg.replace(/currentColor/g, '#ffffff');

// Dark version: black icon on white background (for Chrome Web Store)
const darkSvg = baseSvg.replace(/currentColor/g, '#000000');

mkdirSync(distPath, { recursive: true });

for (const size of sizes) {
  // Light icons (transparent bg, white foreground)
  await sharp(Buffer.from(lightSvg))
    .resize(size, size)
    .png()
    .toFile(join(distPath, `icon-${size}.png`));
  console.log(`Generated icon-${size}.png`);

  // Dark icons (white bg, black foreground)
  await sharp(Buffer.from(darkSvg))
    .flatten({ background: '#ffffff' })
    .resize(size, size)
    .png()
    .toFile(join(distPath, `icon-dark-${size}.png`));
  console.log(`Generated icon-dark-${size}.png`);
}

console.log('Done!');
