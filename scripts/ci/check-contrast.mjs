#!/usr/bin/env node
/* check-contrast: نسبت کنتراست WCAG جفت‌رنگ‌های ممیزی‌شده (روشن+تاریک) ≥ 4.5
   اگر رنگی در index.html عوض شود ولی ممیزی نشود، همین‌جا قرمز می‌شود (BUG-09) */
import { guardMain, readText, makeTempTree, tempWrite, cleanup, runGuard } from './lib.mjs';

function lum(hex) {
  const c = hex.replace('#', '');
  const f = i => {
    let v = parseInt(c.substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4);
}
function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/* [نام, متن, پس‌زمینه, حداقل] — رنگ‌ها باید در index.html موجود باشند */
const PAIRS = [
  ['light body', '#241844', '#f8f5ff'],
  ['light card-title', '#30204f', '#eee9ff'],
  ['light filter', '#5b4b82', '#ffffff'],
  ['light top-btn', '#ffffff', '#4930a4'],
  ['light meta', '#756b91', '#f8f5ff'],
  ['light badge', '#6547bd', '#f1edff'],
  ['light badge-important', '#8a5a0a', '#fff5d9'],
  ['light badge-urgent', '#bd2e68', '#ffeaf3'],
  ['light action-move', '#6041db', '#eeeaff'],
  ['light action-done', '#087c60', '#e4fbf2'],
  ['light action-cancel', '#c93469', '#fff0f5'],
  ['light mini-link', '#6f63a3', '#ffffff'],
  ['light notice', '#805500', '#fff8e8'],
  ['light secondary', '#514078', '#f0ebff'],
  ['light danger', '#b82f60', '#fff0f5'],
  ['dark body', '#e8e4f7', '#14102b'],
  ['dark card-title', '#e8e4f7', '#2a2350'],
  ['dark filter', '#cfc7ee', '#241d45'],
  ['dark meta', '#a89dd0', '#231d42'],
  ['dark mini-link', '#9d92c4', '#231d42'],
  ['dark desc-toggle', '#cfc7ee', '#251e46'],
  ['dark desc', '#d8d2ef', '#1c1734'],
  ['dark secondary', '#cfc7ee', '#2a2350'],
  ['dark notice-warn', '#ffd978', '#3a2f14'],
  ['dark notice-err', '#ff9db0', '#3f1420'],
  ['dark notice-upd', '#9db9ff', '#14213f']
];
const MIN = 4.5;

export async function check(root) {
  let html;
  try { html = readText(root, 'index.html'); } catch { console.error('index.html نیست'); return 2; }
  const failures = [], missing = [];
  for (const [name, fg, bg] of PAIRS) {
    if (!html.includes(fg) || !html.includes(bg)) { missing.push(name + ' (' + fg + '/' + bg + ')'); continue; }
    const r = ratio(fg, bg);
    if (r < MIN) failures.push(name + ' = ' + r.toFixed(2));
  }
  if (missing.length) { console.error('رنگِ ممیزی‌شده در CSS نیست (رنگ عوض شده؟ ممیزی مجدد لازم):', missing.join(', ')); return 1; }
  if (failures.length) { console.error('کنتراست زیر ' + MIN + ':', failures.join(' | ')); return 1; }
  console.error('contrast GREEN — ' + PAIRS.length + ' جفت (روشن+تاریک) ≥ ' + MIN);
  return 0;
}

export async function selfTest() {
  const tmp = makeTempTree(['index.html']);
  try {
    const green = await check(tmp);
    if (green !== 0) { console.error('self-test: ریپوی سالم باید سبز باشد'); return 1; }
    // حمله: رنگ mini به مقدار زیر حد تغییر کند → رنگ ممیزی‌شده در فایل نیست ⇒ قرمز
    let html = readText(tmp, 'index.html');
    html = html.replace(/color:#6f63a3;text-decoration:none/, 'color:#8579a4;text-decoration:none');
    tempWrite(tmp, 'index.html', html);
    const red = await runGuard('scripts/ci/check-contrast.mjs', tmp);
    if (red.code !== 1) { console.error('self-test: حملهٔ کنتراست قرمز نشد', red.stdout, red.stderr); return 1; }
    // صحت خودِ محاسبه: سیاه/سفید = 21
    if (Math.abs(ratio('#000000', '#ffffff') - 21) > 0.01) { console.error('self-test: تابع نسبت غلط است'); return 1; }
    return 0;
  } finally { cleanup(tmp); }
}

guardMain(process.argv.slice(2), check, selfTest);
