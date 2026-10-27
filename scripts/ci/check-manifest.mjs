#!/usr/bin/env node
/* check-manifest: manifest معتبر + آیکون‌ها موجود + فیلدهای نصب‌پذیری (CP-08) */
import path from 'node:path';
import { guardMain, readText, exists, makeTempTree, cleanup, runGuard } from './lib.mjs';

export async function check(root) {
  let m;
  try { m = JSON.parse(readText(root, 'manifest.webmanifest')); } catch (e) { console.error('manifest JSON نامعتبر:', e.message); return 1; }
  const req = { name: 'string', short_name: 'string', start_url: 'string', scope: 'string', display: 'string', lang: 'string', dir: 'string' };
  for (const [k, t] of Object.entries(req)) {
    if (typeof m[k] !== t || !m[k]) { console.error('فیلد ناقص/نامعتبر manifest:', k); return 1; }
  }
  if (m.display !== 'standalone') { console.error('display باید standalone باشد'); return 1; }
  if (!Array.isArray(m.icons) || m.icons.length < 4) { console.error('حداقل ۴ آیکون (any+maskable) لازم است'); return 1; }
  const missing = [];
  for (const ic of m.icons) {
    if (!ic.src || !exists(root, ic.src.replace(/^\.\//, ''))) missing.push(ic.src);
    if (!ic.purpose || !/any|maskable/.test(ic.purpose)) missing.push(ic.src + ' (purpose)');
  }
  if (missing.length) { console.error('آیکون‌های مشکل‌دار:', missing.join(', ')); return 1; }
  const anyMaskable = m.icons.some(i => (i.purpose || '').includes('maskable'));
  if (!anyMaskable) { console.error('آیکون maskable الزامی است'); return 1; }
  return 0;
}

export async function selfTest() {
  const tmp = makeTempTree(['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png', 'icons/favicon.ico']);
  try {
    const green = await check(tmp);
    if (green !== 0) { console.error('self-test: درخت سالم باید سبز باشد'); return 1; }
    const broken = JSON.parse(readText(tmp, 'manifest.webmanifest'));
    broken.icons = broken.icons.filter(i => !i.src.includes('maskable-512'));
    broken.icons.push({ src: 'icons/missing-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(tmp, 'manifest.webmanifest'), JSON.stringify(broken, null, 2));
    const red = await runGuard('scripts/ci/check-manifest.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: manifest خراب قرمز نشد', red.stdout, red.stderr); return 1; }
    return 0;
  } finally { cleanup(tmp); }
}

guardMain(process.argv.slice(2), check, selfTest);
