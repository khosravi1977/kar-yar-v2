/* کتابخانهٔ مشترک گاردها — قرارداد خروج: 0 سالم · 1 رگرسیون · 2 عدم‌قابل‌اندازه‌گیری(=شکست) */
import { readFileSync, existsSync, readdirSync, mkdtempSync, cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const CI_DIR = SCRIPT_DIR;
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
export const LEDGER_REL = 'quality-baseline.d/20261026-000000Z-initial.json';

export function argRoot(argv) {
  const i = argv.indexOf('--root');
  return (i >= 0 && argv[i + 1]) ? path.resolve(argv[i + 1]) : REPO_ROOT;
}
export function isSelfTest(argv) { return argv.includes('--self-test'); }

export function readText(root, rel) { return readFileSync(path.join(root, rel), 'utf8'); }
export function exists(root, rel) { return existsSync(path.join(root, rel)); }
export function gzipKB(file) { return zlib.gzipSync(readFileSync(file)).length / 1024; }

/* دفتر کیفیت (L7): آخرین entry هر کلید ملاک است؛ append-only */
export function latestBaseline(root) {
  const dir = path.join(root, 'quality-baseline.d');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
  if (!files.length) return null;
  let merged = {};
  for (const f of files) merged = Object.assign(merged, JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
  return merged;
}

/* زیرساخت self-test: کپی بخشی از ریپو در temp + جهش + انتظار قرمز */
export function makeTempTree(rels) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ky-guard-'));
  for (const rel of rels) {
    const from = path.join(REPO_ROOT, rel);
    const to = path.join(tmp, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to);
  }
  return tmp;
}
export function tempWrite(tmp, rel, content) {
  const to = path.join(tmp, rel);
  mkdirSync(path.dirname(to), { recursive: true });
  writeFileSync(to, content);
}
export function cleanup(tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch (_) { } }
export function rmInTree(tmp, rel) { try { rmSync(path.join(tmp, rel), { force: true }); } catch (_) { } }

/* اجرای یک گارد روی root دلخواه به‌صورت subprocess (برای self-test و red-injection) */
export async function runGuard(scriptRel, rootDir) {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(REPO_ROOT, scriptRel), '--root', rootDir], { encoding: 'utf8' });
  return { code: r.status === null ? 2 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

export function guardMain(argv, checkFn, selfTestFn) {
  (async () => {
    try {
      if (isSelfTest(argv)) {
        const code = await selfTestFn();
        console.log(code === 0 ? 'SELF-TEST GREEN (red proven internally)' : 'SELF-TEST FAILED');
        process.exit(code);
      }
      const code = await checkFn(argRoot(argv));
      console.log(code === 0 ? 'GUARD GREEN' : code === 1 ? 'GUARD RED (regression)' : 'GUARD CANNOT-MEASURE (=FAIL)');
      process.exit(code);
    } catch (e) {
      console.error('GUARD ERROR:', e && e.message);
      process.exit(2);
    }
  })();
}
