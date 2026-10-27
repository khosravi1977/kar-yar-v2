#!/usr/bin/env node
/* smoke-fast (L4 سریع): بوت واقعی روی HTTP + فایل‌های shell + DOM بحرانی + manifest + بودجهٔ حجم
   بودجه: ≤ 3 دقیقه (Table B.4) */
import http from 'node:http';
import { readFile, statSync } from 'node:fs';
import path from 'node:path';
import { guardMain, REPO_ROOT, gzipKB, latestBaseline, exists, makeTempTree, cleanup, runGuard } from './lib.mjs';

const CRITICAL_FILTERS = ['امروز', 'عقب‌افتاده', 'آینده', 'همه فعال‌ها', 'انجام‌شده', 'لغوشده', 'سوابق انتقال'];

function serve(root) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
      const p = path.join(root, rel);
      readFile(p, (err, buf) => {
        if (err) { res.writeHead(404); res.end('nf'); return; }
        const ext = path.extname(p);
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
        res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
        res.end(buf);
      });
    }).listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}
const get = (port, p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: '/' + p }, res => {
    let body = ''; res.on('data', d => body += d); res.on('end', () => resolve({ status: res.statusCode, body }));
  }).on('error', reject);
});

export async function check(root) {
  const t0 = Date.now();
  if (!exists(root, 'index.html')) { console.error('index.html نیست'); return 2; }
  const { srv, port } = await serve(root);

  // ۱) shell کامل روی HTTP واقعی
  const sw = (await get(port, 'sw.js')).body;
  const shellMatch = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  if (!shellMatch) { console.error('APP_SHELL نیست'); srv.close(); return 2; }
  const shell = [...shellMatch[1].matchAll(/'([^']+)'/g)].map(x => x[1].replace(/^\.\//, '')).filter(x => x !== '');
  for (const f of shell) {
    const r = await get(port, f);
    if (r.status !== 200 || !r.body.length) { console.error('smoke: فایل shell روی HTTP نمی‌آید:', f); srv.close(); return 1; }
  }

  // ۲) DOM بحرانی در index.html (Table C.1 حملهٔ ۱ باید قرمز دهد)
  const html = (await get(port, 'index.html')).body;
  const problems = [];
  for (const f of CRITICAL_FILTERS) if (!html.includes('data-filter') && !html.includes('>' + f + '<')) problems.push('فیلتر: ' + f);
  for (const id of ['id="add"', 'id="taskSave"', 'id="taskModal"', 'id="exportBtn"', 'id="importBtn"', 'id="settingsOpen"', 'id="wipeBtn"', 'id="tsBtn"']) {
    if (!html.includes(id)) problems.push('عنصر بحرانی: ' + id);
  }
  if (!html.includes('rel="manifest"')) problems.push('لینک manifest');
  if (!html.includes("serviceWorker.register('sw.js')") && !html.includes('serviceWorker.register("sw.js")')) problems.push('ثبت service worker');
  if (!html.includes('Vazirmatn')) problems.push('فونت وزیرمتن');
  if (problems.length) { console.error('smoke: ' + problems.join(' | ')); srv.close(); return 1; }

  // ۳) manifest
  let mf;
  try { mf = JSON.parse((await get(port, 'manifest.webmanifest')).body); } catch { console.error('manifest JSON نامعتبر'); srv.close(); return 1; }
  if (!mf.name || mf.icons.length < 4) { console.error('manifest ناقص'); srv.close(); return 1; }

  // ۴) بودجهٔ حجم از دفتر
  const base = latestBaseline(root);
  if (!base || !base.budgets) { console.error('دفتر بودجه نیست'); srv.close(); return 2; }
  const gz = gzipKB(path.join(root, 'index.html'));
  if (gz > base.budgets.indexGzipKB) { console.error('حجم gzip ' + gz.toFixed(1) + 'KB > سقف'); srv.close(); return 1; }

  const secs = (Date.now() - t0) / 1000;
  if (secs > 180) { console.error('smoke از بودجهٔ ۳ دقیقه گذشت:', secs); srv.close(); return 1; }
  console.error(`smoke-fast GREEN — ${shell.length} فایل shell، ${CRITICAL_FILTERS.length} فیلتر، gzip=${gz.toFixed(1)}KB، ${secs.toFixed(1)}s`);
  srv.close();
  return 0;
}

export async function selfTest() {
  // self-test برای smoke = حملهٔ حذف یک دکمهٔ بحرانی از DOM (Table C.1 حملهٔ ۱)
  const tmp = makeTempTree(['index.html', 'sw.js', 'manifest.webmanifest', 'quality-baseline.d/20261026-000000Z-initial.json', 'js/idb.js', 'js/quota.js', 'js/logger.js', 'js/migration.js', 'js/repository.js']);
  try {
    let html = (await import('node:fs')).readFileSync(path.join(tmp, 'index.html'), 'utf8');
    html = html.replace('<button class="filter" data-filter="all">همه فعال‌ها</button>', '');
    (await import('node:fs')).writeFileSync(path.join(tmp, 'index.html'), html);
    const red = await runGuard('scripts/ci/smoke-fast.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: حذف دکمهٔ بحرانی قرمز نشد', red.stdout, red.stderr); return 1; }
    return 0;
  } finally { cleanup(tmp); }
}

guardMain(process.argv.slice(2), check, selfTest);
