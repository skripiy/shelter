/**
 * Shelter Accord — Icon Generator
 * Generates PNG icons from SVG source using @resvg/resvg-js (Wasm, no native deps).
 *
 * Usage:  node scripts/gen-icons.mjs
 */

import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let Resvg;
try {
  ({ Resvg } = require('@resvg/resvg-js'));
} catch {
  console.error('❌  Missing dependency. Run:  npm install --save-dev @resvg/resvg-js');
  process.exit(1);
}

const ASSETS = resolve(__dirname, '../apps/mobile/assets');
const SVG_SRC = resolve(ASSETS, 'icon.svg');

const svgData = readFileSync(SVG_SRC);

function renderPng(size) {
  const resvg = new Resvg(svgData, {
    fitTo: { mode: 'width', value: size },
  });
  return resvg.render().asPng();
}

mkdirSync(ASSETS, { recursive: true });

const targets = [
  { file: 'icon.png',          size: 1024 },
  { file: 'adaptive-icon.png', size: 1024 },
  { file: 'splash.png',        size: 1242 },
  { file: 'favicon.png',       size: 196  },
];

for (const { file, size } of targets) {
  const out = resolve(ASSETS, file);
  writeFileSync(out, renderPng(size));
  console.log(`✅  ${file}  (${size}px)`);
}

console.log('\n🎨  Icons generated in apps/mobile/assets/');
