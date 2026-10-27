#!/usr/bin/env node
/* check-ci-contract — META-GUARD (L8): فایروالِ فایروال
   R1 هر گارد در CI صدا زده شود · R2 --self-test در CI · R3 صفر continue-on-error/|| true/SKIP_
   R4 اکشن‌ها با SHA چهل‌کاراکتری · R5 خودِ متاگارد در CI باشد */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { guardMain, readText, makeTempTree, tempWrite, cleanup, runGuard } from './lib.mjs';

export async function check(root) {
  const wfDir = path.join(root, '.github', 'workflows');
  let files = [];
  try { files = readdirSync(wfDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml')); } catch { console.error('.github/workflows نیست'); return 2; }
  if (!files.length) { console.error('هیچ workflow‌ای نیست'); return 2; }
  const all = files.map(f => ({ f, src: readText(root, path.join('.github', 'workflows', f)) }));
  const joined = all.map(a => a.src).join('\n');

  // R1: هر گارد حداقل یک‌بار صدا زده شود
  let guards = [];
  try { guards = readdirSync(path.join(root, 'scripts', 'ci')).filter(f => /^check-.*\.mjs$/.test(f)); } catch { console.error('scripts/ci نیست'); return 2; }
  const notWired = guards.filter(g => !joined.includes(g));
  if (notWired.length) { console.error('R1 نقض: گاردهای بدون CI:', notWired.join(', ')); return 1; }

  // R2: self-test در CI
  if (!joined.includes('--self-test')) { console.error('R2 نقض: --self-test در CI اجرا نمی‌شود'); return 1; }

  // R3: سبزسازی مصنوعی ممنوع
  for (const a of all) {
    if (/continue-on-error/.test(a.src)) { console.error('R3 نقض: continue-on-error در', a.f); return 1; }
    if (/\|\|\s*true/.test(a.src)) { console.error('R3 نقض: || true در', a.f); return 1; }
    if (/(SKIP_|BYPASS_|IGNORE_)[A-Z_]*:/.test(a.src)) { console.error('R3 نقض: متغیر عبور در', a.f); return 1; }
  }

  // R4: pin با SHA چهل‌کاراکتری
  for (const a of all) {
    for (const m of a.src.matchAll(/uses:\s*(\S+)@(\S+)/g)) {
      if (!/^[0-9a-f]{40}$/.test(m[2])) { console.error('R4 نقض: اکشن pin‌نشده در', a.f, '→', m[1] + '@' + m[2]); return 1; }
    }
  }

  // R5: متاگارد خودش wired باشد
  if (!joined.includes('check-ci-contract.mjs')) { console.error('R5 نقض: متاگارد در CI نیست'); return 1; }
  return 0;
}

export async function selfTest() {
  const rels = ['scripts/ci/check-sw-precache.mjs', 'scripts/ci/check-manifest.mjs', 'scripts/ci/check-storage-contract.mjs', 'scripts/ci/check-js-purity.mjs', 'scripts/ci/check-forbidden.mjs', 'scripts/ci/check-size.mjs', 'scripts/ci/check-test-floor.mjs', 'scripts/ci/check-ci-contract.mjs'];
  const tmp = makeTempTree(rels);
  try {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(path.join(tmp, '.github', 'workflows'), { recursive: true });
    const wf = [
      'name: ci',
      'on: [push]',
      'jobs:',
      '  verify:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683',
      '      - run: node scripts/ci/check-all.mjs  # runs every guard + --self-test per guard (R2)'
    ].concat(rels.map(r => '      # guard: ' + path.basename(r))).join('\n') + '\n';
    writeFileSync(path.join(tmp, '.github', 'workflows', 'ci.yml'), wf);
    const green = await check(tmp);
    if (green !== 0) { console.error('self-test: workflow سالم باید سبز باشد'); return 1; }
    // حمله: continue-on-error
    const bad1 = wf.replace('      - run: node scripts/ci/check-all.mjs', '      - run: node scripts/ci/check-all.mjs\n        continue-on-error: true');
    writeFileSync(path.join(tmp, '.github', 'workflows', 'ci.yml'), bad1);
    let red = await runGuard('scripts/ci/check-ci-contract.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: R3 قرمز نشد'); return 1; }
    // حمله: حذف یک گارد از CI
    const bad2 = wf.replace('      # guard: check-size.mjs\n', '');
    writeFileSync(path.join(tmp, '.github', 'workflows', 'ci.yml'), bad2);
    red = await runGuard('scripts/ci/check-ci-contract.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: R1 قرمز نشد'); return 1; }
    return 0;
  } finally { cleanup(tmp); }
}

guardMain(process.argv.slice(2), check, selfTest);
