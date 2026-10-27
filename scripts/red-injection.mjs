#!/usr/bin/env node
/* red-injection (PART C): ۸ حملهٔ عمدی — هرکدام باید قرمز شود؛ شواهد در docs/evidence/red-injection.md */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { makeTempTree, cleanup, runGuard, rmInTree, REPO_ROOT } from './ci/lib.mjs';

const LEDGER = 'quality-baseline.d/20261026-000000Z-initial.json';
const SHELL_FILES = ['sw.js', 'index.html', 'manifest.webmanifest', 'js/idb.js', 'js/quota.js', 'js/logger.js', 'js/migration.js', 'js/repository.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-64.png', 'icons/favicon.ico', 'fonts/Vazirmatn-Regular.woff2', 'fonts/Vazirmatn-Medium.woff2', 'fonts/Vazirmatn-Bold.woff2'];
const WF_FILES = ['.github/workflows/ci.yml'].concat(['scripts/ci/check-sw-precache.mjs', 'scripts/ci/check-manifest.mjs', 'scripts/ci/check-storage-contract.mjs', 'scripts/ci/check-js-purity.mjs', 'scripts/ci/check-forbidden.mjs', 'scripts/ci/check-size.mjs', 'scripts/ci/check-test-floor.mjs', 'scripts/ci/check-ci-contract.mjs', 'scripts/ci/check-all.mjs', 'scripts/ci/lib.mjs', 'scripts/ci/smoke-fast.mjs']);

const attacks = [
  {
    n: 1, name: 'حذف دکمهٔ ناوبری بحرانی', guard: 'smoke-fast.mjs',
    async setup() { const t = makeTempTree(['index.html', 'sw.js', 'manifest.webmanifest', LEDGER, 'js/idb.js', 'js/quota.js', 'js/logger.js', 'js/migration.js', 'js/repository.js']); let h = readT(t, 'index.html'); h = h.replace('<button class="filter" data-filter="all">همه فعال‌ها</button>', ''); writeT(t, 'index.html', h); return t; }
  },
  {
    n: 2, name: 'نفوذ DOM به لایهٔ داده (import مرزی)', guard: 'check-js-purity.mjs',
    async setup() { const t = makeTempTree(['js/repository.js']); writeT(t, 'js/repository.js', readT(t, 'js/repository.js') + '\n// attack: document.querySelector("#x");\n'); return t; }
  },
  {
    n: 3, name: 'عملیات مخرب داده (deleteDatabase در مهاجرت)', guard: 'check-storage-contract.mjs',
    async setup() { const t = makeTempTree(['js/idb.js', 'js/repository.js', 'js/migration.js']); writeT(t, 'js/migration.js', readT(t, 'js/migration.js') + '\n// attack: indexedDB.deleteDatabase("kar-yar-db");\n'); return t; }
  },
  {
    n: 4, name: 'حذف یک گارد از CI', guard: 'check-ci-contract.mjs',
    async setup() { const t = makeTempTree(WF_FILES); let w = readT(t, '.github/workflows/ci.yml'); w = w.replace('          node scripts/ci/check-size.mjs\n', ''); writeT(t, '.github/workflows/ci.yml', w); return t; }
  },
  {
    n: 5, name: 'سبزسازی مصنوعی (continue-on-error)', guard: 'check-ci-contract.mjs',
    async setup() { const t = makeTempTree(WF_FILES); let w = readT(t, '.github/workflows/ci.yml'); w = w.replace('        run: node scripts/ci/smoke-fast.mjs', '        run: node scripts/ci/smoke-fast.mjs\n        continue-on-error: true'); writeT(t, '.github/workflows/ci.yml', w); return t; }
  },
  {
    n: 6, name: 'دستکاری خروجی تولیدی (فایل precache)', guard: 'check-sw-precache.mjs',
    async setup() { const t = makeTempTree(SHELL_FILES); rmInTree(t, path.join('icons', 'icon-512.png')); return t; }
  },
  {
    n: 7, name: '|| true برای پنهان کردن شکست', guard: 'check-ci-contract.mjs',
    async setup() { const t = makeTempTree(WF_FILES); let w = readT(t, '.github/workflows/ci.yml'); w = w.replace('        run: node scripts/ci/smoke-fast.mjs', '        run: node scripts/ci/smoke-fast.mjs || true'); writeT(t, '.github/workflows/ci.yml', w); return t; }
  },
  {
    n: 8, name: 'حذف خاموش یک فایل تست', guard: 'check-test-floor.mjs',
    async setup() { const t = makeTempTree(['js/idb.js', 'js/quota.js', 'js/logger.js', 'js/migration.js', 'js/repository.js', 'tests/idb.test.mjs', 'tests/quota.test.mjs', 'tests/logger.test.mjs', 'tests/migration.test.mjs', 'tests/repository.test.mjs', LEDGER]); rmInTree(t, path.join('tests', 'quota.test.mjs')); return t; }
  }
];

function readT(root, rel) { return readFileSync(path.join(root, rel), 'utf8'); }
function writeT(root, rel, c) { mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); writeFileSync(path.join(root, rel), c); }

const lines = ['# شواهد تزریق قرمز (PART C) — ' + new Date().toISOString(), '', '| # | حمله | گارد پاسخگو | وضعیت | خروجی |', '|---|---|---|---|---|'];
let allRed = true;
for (const a of attacks) {
  let tmp = null, status = 'ERROR', out = '';
  try {
    tmp = await a.setup();
    const r = await runGuard('scripts/ci/' + a.guard, tmp);
    status = r.code === 1 ? '🔴 RED' : '🟠 exit=' + r.code;
    if (r.code !== 1) allRed = false;
    out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(0, 2).join(' / ').replace(/\|/g, '/');
  } catch (e) { status = 'SETUP-ERROR'; out = e.message; allRed = false; }
  console.log(`#${a.n} ${a.name} → ${status} [${a.guard}]`);
  lines.push(`| ${a.n} | ${a.name} | ${a.guard} | ${status} | ${out} |`);
  if (tmp) cleanup(tmp);
}
lines.push('', allRed ? '**نتیجه: هر ۸ حمله قرمز شدند — فایروال اثبات شد.**' : '**نتیجه: حداقل یک حمله قرمز نشد — فایروال ناقص است.**');
const dir = path.join(REPO_ROOT, 'docs', 'evidence');
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'red-injection.md'), lines.join('\n') + '\n');
console.log(allRed ? 'RED-INJECTION: ALL 8 RED ✓ (evidence → docs/evidence/red-injection.md)' : 'RED-INJECTION: INCOMPLETE');
process.exit(allRed ? 0 : 1);
