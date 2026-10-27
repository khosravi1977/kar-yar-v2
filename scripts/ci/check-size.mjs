#!/usr/bin/env node
/* check-size: سقف‌های حجم از دفتر L7 خوانده می‌شود — عدد واقعی، نه آرزو (Table 0.2.5) */
import path from 'node:path';
import { guardMain, exists, gzipKB, latestBaseline, makeTempTree, cleanup, rmInTree, runGuard, LEDGER_REL } from './lib.mjs';

export async function check(root) {
  const base = latestBaseline(root);
  if (!base || !base.budgets) { console.error('دفتر کیفیت (quality-baseline.d) یا budgets موجود نیست — exit 2 = شکست'); return 2; }
  const b = base.budgets;
  if (!exists(root, 'index.html')) { console.error('index.html نیست'); return 2; }
  const gz = gzipKB(path.join(root, 'index.html'));
  if (gz > b.indexGzipKB) { console.error('index.html gzipped = ' + gz.toFixed(1) + 'KB > سقف ' + b.indexGzipKB + 'KB'); return 1; }
  for (const rel of ['js/idb.js', 'js/quota.js', 'js/logger.js', 'js/migration.js', 'js/repository.js', 'sw.js']) {
    const p = path.join(root, rel);
    const { statSync } = await import('node:fs');
    const kb = statSync(p).size / 1024;
    if (kb > b.jsMaxKB) { console.error(rel + ' = ' + kb.toFixed(1) + 'KB > سقف ' + b.jsMaxKB + 'KB'); return 1; }
  }
  console.error('اندازه‌ها: index.html gzip=' + gz.toFixed(1) + 'KB (سقف ' + b.indexGzipKB + ')');
  return 0;
}

export async function selfTest() {
  const tmp = makeTempTree(['index.html', 'js/idb.js', 'js/quota.js', 'js/logger.js', 'js/migration.js', 'js/repository.js', 'sw.js', LEDGER_REL]);
  try {
    rmInTree(tmp, LEDGER_REL); // حالت بدون دفتر
    // بدون دفتر ⇒ 2 (=شکست)
    const noLedger = await check(tmp);
    if (noLedger !== 2) { console.error('self-test: نبود دفتر باید 2 باشد'); return 1; }
    // سقف غیرممکن کوچک ⇒ 1 (قرمز)
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(tmp, 'quality-baseline.d', 't.json'), JSON.stringify({ budgets: { indexGzipKB: 0.001, jsMaxKB: 0.001 } }));
    const red = await runGuard('scripts/ci/check-size.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: سقف غیرممکن قرمز نشد', red.stdout, red.stderr); return 1; }
    return 0;
  } finally { cleanup(tmp); }
}

guardMain(process.argv.slice(2), check, selfTest);
