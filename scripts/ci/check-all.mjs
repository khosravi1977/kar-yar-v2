#!/usr/bin/env node
/* check-all: همهٔ گاردها روی ریپوی واقعی + self-test هر گارد (R2). هر غیرصفر = قرمز کل */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GUARDS = ['check-sw-precache.mjs', 'check-manifest.mjs', 'check-storage-contract.mjs', 'check-js-purity.mjs', 'check-forbidden.mjs', 'check-size.mjs', 'check-contrast.mjs', 'check-test-floor.mjs', 'check-ci-contract.mjs'];
const SELF_ONLY = process.argv.includes('--self-tests-only');

let failed = false;
for (const g of GUARDS) {
  const p = path.join(HERE, g);
  const real = SELF_ONLY ? { status: 0, stdout: '(skipped: self-only mode)', stderr: '' } : spawnSync(process.execPath, [p], { encoding: 'utf8' });
  const self = spawnSync(process.execPath, [p, '--self-test'], { encoding: 'utf8' });
  const okReal = real.status === 0, okSelf = self.status === 0;
  console.log(`${g.padEnd(30)} real=${real.status === 0 ? 'GREEN' : 'RED(' + real.status + ')'}  self-test=${okSelf ? 'GREEN' : 'RED(' + self.status + ')'}`);
  if (!okReal) console.log('  ↳ ' + (real.stdout || '').trim() + (real.stderr || '').trim());
  if (!okSelf) console.log('  ↳ self: ' + (self.stdout || '').trim() + (self.stderr || '').trim());
  if (!okReal || !okSelf) failed = true;
}
console.log(failed ? 'CHECK-ALL: RED' : `CHECK-ALL: GREEN (${GUARDS.length}/${GUARDS.length} guards + self-tests)`);
process.exit(failed ? 1 : 0);
