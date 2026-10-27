#!/usr/bin/env node
/* check-js-purity: ماژول‌های js/ لایهٔ دادهٔ خالص‌اند — نفوذ DOM ممنوع (H5 از COUPLING-MAP) */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { guardMain, readText, makeTempTree, tempWrite, cleanup, runGuard } from './lib.mjs';

const FORBIDDEN = [/document\./, /querySelector/, /window\.location/, /getElementById/, /innerHTML/];

export async function check(root) {
  const dir = path.join(root, 'js');
  let files;
  try { files = readdirSync(dir).filter(f => f.endsWith('.js')); } catch { console.error('پوشه js/ نیست'); return 2; }
  const hits = [];
  for (const f of files) {
    const src = readText(root, path.join('js', f));
    for (const re of FORBIDDEN) {
      const m = src.match(re);
      if (m) hits.push(f + ' → ' + m[0]);
    }
  }
  if (hits.length) { console.error('نفوذ DOM به لایهٔ داده:', hits.join(' | ')); return 1; }
  return 0;
}

export async function selfTest() {
  const tmp = makeTempTree(['js/idb.js']);
  try {
    const green = await check(tmp);
    if (green !== 0) { console.error('self-test: درخت سالم باید سبز باشد'); return 1; }
    tempWrite(tmp, 'js/attack.js', '// attack\ndocument.querySelector("#x");\n');
    const red = await runGuard('scripts/ci/check-js-purity.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: حملهٔ نفوذ DOM قرمز نشد', red.stdout, red.stderr); return 1; }
    return 0;
  } finally { cleanup(tmp); }
}

guardMain(process.argv.slice(2), check, selfTest);
