// Genera los PNG de los iconos a partir de public/icons/icon.svg usando Playwright (Chromium).
// Uso: npm run icons   (requiere `playwright` disponible en el entorno)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');

const targets = [
  { file: 'icon-192.png', size: 192, pad: 0, bg: 'transparent' },
  { file: 'icon-512.png', size: 512, pad: 0, bg: 'transparent' },
  { file: 'apple-touch-icon.png', size: 180, pad: 0, bg: '#0b0f14' },
  // Maskable: el contenido dentro de la zona segura (80 %) y fondo completo.
  { file: 'icon-maskable-512.png', size: 512, pad: 0.12, bg: '#0b0f14' },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:${t.bg};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: join(dir, t.file), omitBackground: t.bg === 'transparent' });
  console.log('✔', t.file);
}
await browser.close();
