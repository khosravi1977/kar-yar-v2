#!/usr/bin/env node
/* check-storage-contract: قرارداد لایهٔ ذخیره‌سازی (درس Trap-01/putMeta) + ممنوعیت‌های از دست رفتن داده */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { guardMain, readText, makeTempTree, tempWrite, cleanup, runGuard } from './lib.mjs';

const IDB_FNS = ['open', 'getMeta', 'putMeta', 'atomicWrite', 'getAllTasks', 'countTasks', 'clearAll'];

export async function check(root) {
  let idb, repo, mig;
  try {
    idb = readText(root, 'js/idb.js');
    repo = readText(root, 'js/repository.js');
    mig = readText(root, 'js/migration.js');
  } catch (e) { console.error('فایل‌های لایهٔ ذخیره‌سازی یافت نشدند:', e.message); return 2; }

  const missing = IDB_FNS.filter(fn => !new RegExp('function ' + fn + '\\b').test(idb) || !new RegExp('\\b' + fn + ':').test(idb));
  if (missing.length) { console.error('قرارداد KarIDB نقض شد — توابع بدون export در return:', missing.join(', ')); return 1; }

  for (const key of ['inserted', 'replaced', 'ignored', 'invalid']) {
    if (!repo.includes(key)) { console.error('قرارداد bulkUpsert ناقص: کلید summary', key); return 1; }
  }
  if (!/\bfunction bulkUpsert\b/.test(repo)) { console.error('bulkUpsert در repository نیست'); return 1; }
  if (!repo.includes("resetCache") || !repo.includes('lastRecordVersion')) { console.error('کش recordVersion/resetCache در repository نیست'); return 1; }

  if (!mig.includes('_migration_backup_v1')) { console.error('پشتیبان مهاجرت (_migration_backup_v1) در migration.js نیست'); return 1; }
  if (!mig.includes('atomicWrite')) { console.error('مهاجرت باید از atomicWrite اتمیک استفاده کند'); return 1; }

  // از دست رفتن داده: deleteDatabase و clear خارج از نقاط مجاز ممنوع
  const jsFiles = readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'));
  for (const f of jsFiles) {
    const src = readText(root, path.join('js', f));
    if (/deleteDatabase\s*\(/.test(src)) { console.error('deleteDatabase در', f, 'ممنوع است (ریسک از دست رفتن داده)'); return 1; }
    if (/\.clear\(\)/.test(src) && f !== 'idb.js' && f !== 'repository.js') { console.error('clear() خارج از نقاط مجاز در', f); return 1; }
  }
  return 0;
}

export async function selfTest() {
  const tmp = makeTempTree(['js/idb.js', 'js/repository.js', 'js/migration.js']);
  try {
    const green = await check(tmp);
    if (green !== 0) { console.error('self-test: درخت سالم باید سبز باشد'); return 1; }
    // حملهٔ Trap-01: تعریف putMeta حذف شود (فقط ارجاع بماند)
    let idb = readText(tmp, 'js/idb.js');
    idb = idb.replace(/function putMeta[\s\S]*?\n  \}/, 'function putMeta__removed() {}');
    tempWrite(tmp, 'js/idb.js', idb);
    const red = await runGuard('scripts/ci/check-storage-contract.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: حملهٔ putMeta قرمز نشد', red.stdout, red.stderr); return 1; }
    // حملهٔ داده‌ها: deleteDatabase در migration
    const tmp2 = makeTempTree(['js/idb.js', 'js/repository.js', 'js/migration.js']);
    try {
      let mig = readText(tmp2, 'js/migration.js');
      tempWrite(tmp2, 'js/migration.js', mig + '\n// attack: indexedDB.deleteDatabase("kar-yar-db");\n');
      const red2 = await runGuard('scripts/ci/check-storage-contract.mjs', tmp2);
      if (red2.code !== 1) { console.error('self-test: حملهٔ deleteDatabase قرمز نشد', red2.stdout, red2.stderr); return 1; }
    } finally { cleanup(tmp2); }
    return 0;
  } finally { cleanup(tmp); }
}

guardMain(process.argv.slice(2), check, selfTest);
