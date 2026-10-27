#!/usr/bin/env node
/* check-test-floor: هر ماژول js باید تست داشته باشد؛ حذف/skip تست = قرمز (Trap D.2-2)؛ کف شمارش از دفتر L7 */
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { guardMain, readText, latestBaseline, makeTempTree, cleanup, runGuard, rmInTree, LEDGER_REL } from './lib.mjs';

export async function check(root) {
  const base = latestBaseline(root);
  if (!base || !base.floors) { console.error('دفتر کیفیت/ floors نیست — exit 2'); return 2; }
  const jsDir = path.join(root, 'js'), tDir = path.join(root, 'tests');
  let jsFiles = [], testFiles = [];
  try { jsFiles = readdirSync(jsDir).filter(f => f.endsWith('.js')); } catch { console.error('js/ نیست'); return 2; }
  try { testFiles = readdirSync(tDir).filter(f => f.endsWith('.test.mjs')); } catch { console.error('tests/ نیست'); return 2; }

  const missing = jsFiles.filter(f => !existsSync(path.join(tDir, f.replace(/\.js$/, '.test.mjs'))));
  if (missing.length) { console.error('ماژول بدون تست:', missing.join(', ')); return 1; }

  if (testFiles.length < (base.floors.unitTestFiles || 0)) {
    console.error('شمار تست‌فایل‌ها ' + testFiles.length + ' < کف دفتر ' + base.floors.unitTestFiles + ' (حذف خاموش تست؟)');
    return 1;
  }
  for (const f of testFiles) {
    const src = readText(root, path.join('tests', f));
    if (!/\btest\(/.test(src)) { console.error('فایل تست بدون تست:', f); return 1; }
    if (/\.skip\(/.test(src) || /\bit\.skip\b/.test(src)) { console.error('تست skip‌شده در', f, '— skip = کسر از کف = قرمز'); return 1; }
  }
  return 0;
}

export async function selfTest() {
  const rels = ['js/idb.js', 'js/quota.js', 'js/logger.js', 'js/migration.js', 'js/repository.js',
    'tests/idb.test.mjs', 'tests/quota.test.mjs', 'tests/logger.test.mjs', 'tests/migration.test.mjs', 'tests/repository.test.mjs', LEDGER_REL];
  const tmp = makeTempTree(rels);
  try {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(tmp, LEDGER_REL), JSON.stringify({ floors: { unitTestFiles: 5 } }));
    const green = await check(tmp);
    if (green !== 0) { console.error('self-test: درخت سالم باید سبز باشد'); return 1; }
    // حملهٔ ۱: حذف یک فایل تست
    rmInTree(tmp, path.join('tests', 'quota.test.mjs'));
    let red = await runGuard('scripts/ci/check-test-floor.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: حذف تست قرمز نشد', red.stdout, red.stderr); return 1; }
    // حملهٔ ۲: skip کردن تست
    const tmp2 = makeTempTree(rels);
    try {
      writeFileSync(path.join(tmp2, LEDGER_REL), JSON.stringify({ floors: { unitTestFiles: 5 } }));
      let src = readText(tmp2, 'tests/idb.test.mjs');
      src = src.replace(/\btest\(/, 'test.skip(');
      writeFileSync(path.join(tmp2, 'tests', 'idb.test.mjs'), src);
      red = await runGuard('scripts/ci/check-test-floor.mjs', tmp2);
      if (red.code !== 1) { console.error('self-test: تست skip قرمز نشد', red.stdout, red.stderr); return 1; }
    } finally { cleanup(tmp2); }
    return 0;
  } finally { cleanup(tmp); }
}

guardMain(process.argv.slice(2), check, selfTest);
