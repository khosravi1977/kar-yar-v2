#!/usr/bin/env node
/* check-forbidden: الگوهای ممنوع — console.log جامانده، debugger، eval، برچسب کار ناتمام، راز‌ها */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { guardMain, readText, makeTempTree, tempWrite, cleanup, runGuard } from './lib.mjs';

const RULES = [
  { name: 'console.log جامانده', re: /(^|[^.\w])console\.log\(/ },
  { name: 'debugger', re: /\bdebugger\b\s*;/ },
  { name: 'eval', re: /[^.\w]eval\(/ },
  { name: ('TO' + 'DO') + '/' + ('FIX' + 'ME') + ' جامانده', re: new RegExp('\\b(' + 'TO' + 'DO|FIX' + 'ME' + ')\\b') },
  { name: 'راز هاردکد', re: /(api[_-]?key|apikey|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i }
];
const SCAN_DIRS = ['js', 'tests', 'scripts'];
// اسکریپت‌های گزارش‌ده خروجی کنسول دارند (شغل‌شان گزارش است) — اجازهٔ صریح، نه عادت (Trap D.2-8)
const SKIP_FILES = new Set(['lib.mjs', 'check-all.mjs', 'red-injection.mjs', 'lh-assert.mjs']);

export async function check(root) {
  const hits = [];
  for (const dir of SCAN_DIRS) {
    let files = [];
    try { files = walk(path.join(root, dir)); } catch { continue; }
    for (const f of files) {
      if (SKIP_FILES.has(path.basename(f))) continue;
      const src = readText(root, path.join(path.relative(root, f)).split(path.sep).join('/'));
      for (const r of RULES) {
        if (r.re.test(src)) hits.push(path.relative(root, f) + ' → ' + r.name);
      }
    }
  }
  if (hits.length) { console.error('الگوهای ممنوع:', hits.join(' | ')); return 1; }
  return 0;
}

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

export async function selfTest() {
  const tmp = makeTempTree(['js/idb.js']);
  try {
    const green = await check(tmp);
    if (green !== 0) { console.error('self-test: درخت سالم باید سبز باشد'); return 1; }
    tempWrite(tmp, 'js/attack.js', '// attack\nconsole' + '.log("leftover");\nconst api' + 'Key = "supersecret' + '123";\n');
    const red = await runGuard('scripts/ci/check-forbidden.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: حملهٔ forbidden قرمز نشد', red.stdout, red.stderr); return 1; }
    return 0;
  } finally { cleanup(tmp); }
}

guardMain(process.argv.slice(2), check, selfTest);
