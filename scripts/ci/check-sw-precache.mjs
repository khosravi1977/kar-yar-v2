#!/usr/bin/env node
/* check-sw-precache: هر فایل در APP_SHELL باید واقعاً روی دیسک باشد (Trap-02: کش ناقص آفلاین) */
import path from 'node:path';
import { rmSync } from 'node:fs';
import { guardMain, readText, exists, makeTempTree, tempWrite, cleanup, runGuard } from './lib.mjs';

export async function check(root) {
  let sw;
  try { sw = readText(root, 'sw.js'); } catch { console.error('sw.js یافت نشد'); return 2; }
  const m = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  if (!m) { console.error('APP_SHELL در sw.js پیدا نشد'); return 2; }
  const entries = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  if (entries.length < 10) { console.error('APP_SHELL ناقص به نظر می‌رسد:', entries.length); return 1; }
  const missing = [];
  for (const e of entries) {
    const rel = e === './' ? 'index.html' : e.replace(/^\.\//, '');
    if (!exists(root, rel)) missing.push(e);
  }
  if (missing.length) { console.error('فایل‌های precache ناموجود:', missing.join(', ')); return 1; }
  return 0;
}

export async function selfTest() {
  const tmp = makeTempTree(['sw.js', 'index.html', 'manifest.webmanifest', 'js/idb.js', 'js/quota.js', 'js/logger.js', 'js/migration.js', 'js/repository.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png', 'icons/favicon.ico', 'fonts/Vazirmatn-Regular.woff2', 'fonts/Vazirmatn-Medium.woff2', 'fonts/Vazirmatn-Bold.woff2']);
  try {
    const green = await check(tmp);
    if (green !== 0) { console.error('self-test: درخت سالم باید سبز باشد'); return 1; }
    rmSync(path.join(tmp, 'icons', 'icon-512.png')); // حمله: فایل precache حذف شده
    const red = await runGuard('scripts/ci/check-sw-precache.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: حمله (حذف فایل precache) قرمز نشد', red.stdout, red.stderr); return 1; }
    return 0;
  } finally { cleanup(tmp); }
}

guardMain(process.argv.slice(2), check, selfTest);
