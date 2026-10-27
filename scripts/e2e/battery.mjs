#!/usr/bin/env node
/* باتری E2E مرورگر واقعی (TEST-MATRIX ردیف ۴ و ۵ — CP-01…CP-06)
   صفر وابستگی: مرورگر نصب‌شدهٔ سیستم با CDP خام (WebSocket داخلی Node) رانده می‌شود.
   رویدادها واقعی DOM هستند (el.click و dispatchEvent — Trap-04)؛ هیچ انتخابگر واهی.
   شواهد: docs/evidence/browser-battery.md + docs/evidence/browser/*.png
   خروج: 0 = همه سبز، 1 = شکست سناریو، 2 = مرورگر یافت نشد (=شکست) */
import http from 'node:http';
import { readFile as readFileCb } from 'node:fs';
import { writeFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'evidence');
const SHOT_DIR = path.join(EVIDENCE_DIR, 'browser');
const KEY_LEGACY = 'yar_kareha_v2';
const NOW = () => new Date().toISOString();

/* ─── سرور استاتیک (همان قرارداد smoke-fast) ─── */
function serve(root) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
      const p = path.join(root, rel);
      readFileCb(p, (err, buf) => {
        if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('nf'); return; }
        const ext = path.extname(p);
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
        res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
        res.end(buf);
      });
    }).listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

/* ─── یافتن مرورگر نصب‌شده ─── */
function findBrowser() {
  const cand = [];
  if (process.env.KAR_BROWSER) cand.push(process.env.KAR_BROWSER);
  if (process.platform === 'win32') {
    cand.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
  } else if (process.platform === 'darwin') {
    cand.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    cand.push('google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'msedge');
  }
  for (const c of cand) {
    if (path.isAbsolute(c)) {
      if (existsSync(c)) return c;
    } else {
      try { return execFileSync(process.platform === 'win32' ? 'where' : 'which', [c], { encoding: 'utf8' }).split(/\r?\n/)[0].trim(); } catch (_) { }
    }
  }
  return null;
}

/* ─── کلاینت CDP خام روی WebSocket داخلی Node ─── */
class CDP {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map(); this.listeners = new Map();
    ws.addEventListener('message', ev => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error('CDP ' + m.error.message)) : resolve(m.result);
      } else if (m.method && this.listeners.has(m.method)) {
        for (const fn of this.listeners.get(m.method)) fn(m.params);
      }
    });
  }
  on(method, fn) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(fn); }
  once(method) { return new Promise(res => { const wrap = p => { this.listeners.set(method, this.listeners.get(method).filter(f => f !== wrap)); res(p); }; this.on(method, wrap); }); }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.ws.send(JSON.stringify({ id, method, params })); } catch (e) { this.pending.delete(id); reject(e); }
    });
  }
  close() { try { this.ws.close(); } catch (_) { } }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
/* با وقوع خطا/تعلیق، کل باتری باید تمام شود — هرگز معلق نمی‌مانیم */
const withTimeout = (p, ms, what) => Promise.race([
  p,
  sleep(ms).then(() => { throw new Error('timeout(' + ms + 'ms): ' + what); })
]);

/* ─── کمکی‌های صفحه: گرفتن JSON از Runtime.evaluate ─── */
async function evalJS(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new Error('خطای صفحه: ' + ((d.exception && d.exception.description) || d.text));
  }
  return r.result.value;
}
/* انتظار درون‌صفحه‌ای برای شرط (نظرسنجی 100ms) */
function waitFor(cdp, conditionJs, label, timeoutMs = 8000) {
  return withTimeout(evalJS(cdp, `(async()=>{const t0=Date.now();while(Date.now()-t0<${timeoutMs}){try{if(${conditionJs})return true}catch(_){/*تلاش مجدد*/}await new Promise(r=>setTimeout(r,100))}return false})()`), timeoutMs + 5000, 'waitFor: ' + label)
    .then(ok => { if (!ok) throw new Error('timeout: ' + label); return true; });
}
const armDialogs = cdp => evalJS(cdp, 'window.confirm=()=>true;window.prompt=(m,d)=>d;window.alert=()=>{};window.__errs=window.__errs||[];window.addEventListener("error",e=>window.__errs.push(e.message+"@"+e.lineno));true');

async function shot(cdp, file) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(file, Buffer.from(r.data, 'base64'));
  return path.basename(file);
}

/* ─── سناریوها ─── */
async function main() {
  const t0 = Date.now();
  const bin = findBrowser();
  const results = [];
  const record = (id, cp, name, expect, ok, out, img) => results.push({ id, cp, name, expect, ok, out, img });
  if (!bin) {
    console.error('مرورگر Chrome/Edge/Chromium یافت نشد (متغیر KAR_BROWSER را ست کنید). exit 2');
    process.exit(2);
  }
  const { srv, port } = await serve(REPO_ROOT);
  const base = `http://127.0.0.1:${port}`;
  const profile = await mkdtemp(path.join(os.tmpdir(), 'ky-e2e-'));
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--window-size=420,860', 'about:blank'];
  const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  /* watchdog کلی: بودجهٔ ماتریس ≤ ۱۵ دقیقه؛ اما اینجا ۴ دقیقه سخت‌گیرانه */
  const watchdog = setTimeout(() => { console.error('BATTERY WATCHDOG: تعلیق — توقف اجباری'); process.exit(1); }, 240000);
  watchdog.unref?.();
  let cdp = null;
  try {
    /* دریافت پورت دیباگ از stderr */
    const dbgPort = await withTimeout(new Promise((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error('DevTools endpoint timeout')), 20000);
      proc.stderr.on('data', d => {
        buf += d.toString();
        const m = buf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
        if (m) { clearTimeout(timer); resolve(Number(m[1])); }
      });
      proc.on('exit', c => { clearTimeout(timer); reject(new Error('مرورگر بلافاصله بسته شد code=' + c + ' :: ' + buf.slice(0, 400))); });
    }), 25000, 'DevTools endpoint');
    console.error(`[boot] browser=${path.basename(bin)} devtools=${dbgPort}`);
    /* اتصال به target صفحه */
    const targets = await withTimeout((await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json(), 10000, '/json/list');
    const page = targets.find(t => t.type === 'page');
    if (!page) throw new Error('target صفحه یافت نشد');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await withTimeout(new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); }), 10000, 'ws open');
    cdp = new CDP(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    const goto = async url => {
      /* ثبت منتظرِ load «پیش از» navigate — رویداد ممکن است زودتر از پاسخ برسد */
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url });
      await withTimeout(loaded, 20000, 'goto ' + url);
      await armDialogs(cdp);
    };
    const click = sel => evalJS(cdp, `document.querySelector(${JSON.stringify(sel)}).click();true`);
    const setVal = (sel, val, ev) => evalJS(cdp, `(()=>{const el=document.querySelector(${JSON.stringify(sel)});el.value=${JSON.stringify(val)};el.dispatchEvent(new Event(${JSON.stringify(ev || 'input')},{bubbles:true}));return true})()`);
    const text = sel => evalJS(cdp, `(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
    const count = sel => evalJS(cdp, `document.querySelectorAll(${JSON.stringify(sel)}).length`);

    await mkdir(SHOT_DIR, { recursive: true });
    const stepLog = (id, msg) => console.error(`[${(Date.now() - t0) / 1000 | 0}s] ${id} ${msg}`);

    /* T1 — CP-01: مهاجرت localStorage→IndexedDB بدون از دست رفتن داده */
    {
      await goto(base + '/__seed__'); /* صفحهٔ 404 هم‌مبنا — فقط برای ست‌کردن localStorage پیش از بوت */
      const legacy = {
        statuses: ['برنامه‌ریزی', 'در حال انجام', 'تکمیل‌شده', 'منتظر پاسخ'],
        taskTitles: ['تماس تلفنی', 'پرداخت قبض'],
        tasks: [
          { id: 'legacy-1', title: 'E2E-قدیمی-یک', description: 'مهاجرت', status: 'برنامه‌ریزی', state: 'active', priority: 'normal', createdAt: NOW(), updatedAt: NOW() },
          { id: 'legacy-2', title: 'E2E-قدیمی-دو', description: '', status: 'در حال انجام', state: 'active', priority: 'important', createdAt: NOW(), updatedAt: NOW() }
        ], events: []
      };
      await evalJS(cdp, `localStorage.setItem(${JSON.stringify(KEY_LEGACY)}, ${JSON.stringify(JSON.stringify(legacy))});true`);
      await goto(base + '/');
      await waitFor(cdp, `(document.getElementById('storageStatusLi')||{}).textContent?.includes('IndexedDB')`, 'بوت + مهاجرت');
      const migratedNotice = await text('#notice');
      await click('button[data-filter="all"]');
      await waitFor(cdp, `document.querySelectorAll('article.card').length===2`, 'دو کار مهاجرت‌شده');
      const ok = migratedNotice.includes('منتقل شد') || (await text('#notice')).includes('منتقل شد');
      const img = await shot(cdp, path.join(SHOT_DIR, '01-migration.png'));
      stepLog('T1', `notice="${migratedNotice.trim().slice(0, 60)}" ok=${ok}`);
      record('T1', 'CP-01', 'بوت + مهاجرت localStorage→IndexedDB', 'پرچم IndexedDB + اعلان انتقال + ۲ کار', ok,
        `notice="${migratedNotice.trim().slice(0, 90)}" cards=2`, img);
    }

    /* T2 — CP-02: ایجاد کار با رویداد واقعی DOM */
    const NEW_TITLE = 'E2E-تسک-جدید';
    {
      await click('#add');
      await waitFor(cdp, `document.getElementById('taskModal').classList.contains('open')`, 'باز شدن مودال');
      await setVal('#taskTitleSelect', '__custom__', 'change');
      await setVal('#taskCustomTitle', NEW_TITLE, 'input');
      await click('#taskSave');
      await waitFor(cdp, `[...document.querySelectorAll('article.card .card-title')].some(b=>b.textContent.includes(${JSON.stringify(NEW_TITLE)}))`, 'کارت کار جدید');
      /* رفتار صحیح اپ: پس از ذخیره، فیلتر به روزِ سررسید می‌رود (امروز) → فقط همان کار دیده می‌شود */
      const cards = await count('article.card');
      const onToday = await evalJS(cdp, `document.querySelector('button[data-filter].active')?.dataset.filter==='today'`);
      const img = await shot(cdp, path.join(SHOT_DIR, '02-create.png'));
      stepLog('T2', `cards=${cards} onToday=${onToday}`);
      record('T2', 'CP-02', 'ایجاد کار (مودال + ذخیره)', `کارت "${NEW_TITLE}" + پرش فیلتر به «امروز»`, cards === 1 && onToday, `cards=${cards} onToday=${onToday}`, img);
    }

    /* T3 — CP-02: پایداری پس از reload (منبع: IndexedDB) */
    {
      await goto(base + '/');
      await waitFor(cdp, `(document.getElementById('storageStatusLi')||{}).textContent?.includes('IndexedDB')`, 'بوت مجدد');
      await click('button[data-filter="all"]');
      await waitFor(cdp, `document.querySelectorAll('article.card').length===3`, '۳ کار پس از reload');
      const still = await evalJS(cdp, `[...document.querySelectorAll('article.card .card-title')].some(b=>b.textContent.includes(${JSON.stringify(NEW_TITLE)}))`);
      const img = await shot(cdp, path.join(SHOT_DIR, '03-persisted.png'));
      stepLog('T3', `persisted=${!!still}`);
      record('T3', 'CP-02', 'پایداری کارها پس از reload', '۳ کار شامل کار جدید', !!still, `persisted=${!!still}`, img);
    }

    /* T4 — CP-03: بارگذاری کاملاً آفلاین با Service Worker */
    {
      await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await goto(base + '/');
      const controlled = await evalJS(cdp, `!!navigator.serviceWorker.controller`);
      await waitFor(cdp, `(document.getElementById('storageStatusLi')||{}).textContent?.includes('IndexedDB')`, 'بوت آفلاین');
      await click('button[data-filter="all"]');
      const cards = await count('article.card');
      const img = await shot(cdp, path.join(SHOT_DIR, '04-offline.png'));
      stepLog('T4', `swController=${controlled} cards=${cards}`);
      record('T4', 'CP-03', 'بارگذاری آفلاین کامل (شبکه قطع)', 'SW کنترل + رندر از کش', controlled && cards === 3, `swController=${controlled} cards=${cards}`, img);
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }

    /* T5 — CP-04: ورودی پشتیبان schemaVersion:1 (ادغام با تأیید) */
    {
      const backup = {
        schemaVersion: 1, app: 'kar-yar', exportedAt: NOW(),
        meta: { statuses: ['برنامه‌ریزی'], taskTitles: [], events: [] },
        tasks: [{ id: 'e2e-import-1', title: 'E2E-وارداتی', description: 'از فایل پشتیبان', status: 'برنامه‌ریزی', state: 'active', priority: 'normal', createdAt: NOW(), updatedAt: NOW() }]
      };
      const f = path.join(profile, 'e2e-backup.json');
      await writeFile(f, JSON.stringify(backup, null, 2), 'utf8');
      const doc = await cdp.send('DOM.getDocument', { depth: 3 });
      const node = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#importFile' });
      if (!node.nodeId) throw new Error('#importFile یافت نشد');
      await cdp.send('DOM.setFileInputFiles', { files: [f], nodeId: node.nodeId });
      await waitFor(cdp, `document.getElementById('notice').textContent.includes('ادغام انجام شد')`, 'اعلان ادغام import');
      await click('button[data-filter="all"]');
      const cards = await count('article.card');
      const img = await shot(cdp, path.join(SHOT_DIR, '05-import.png'));
      stepLog('T5', `cards=${cards}`);
      record('T5', 'CP-04', 'ورودی پشتیبان (schemaVersion:1)', 'اعلان ادغام + ۴ کار', cards === 4, `cards=${cards}`, img);
    }

    /* T6 — CP-05: بازگردانی از پشتیبانِ زمان مهاجرت */
    {
      await click('#settingsOpen');
      await waitFor(cdp, `document.getElementById('settingsModal').classList.contains('open') && !document.getElementById('restoreBackupBtn').hidden`, 'دکمهٔ بازگردانی نمایان');
      await click('#restoreBackupBtn');
      await waitFor(cdp, `document.querySelectorAll('article.card').length===2`, 'بازگشت به ۲ کار مهاجرت');
      const gone = await evalJS(cdp, `![...document.querySelectorAll('article.card .card-title')].some(b=>b.textContent.includes('E2E-وارداتی'))`);
      await click('#settingsClose');
      const img = await shot(cdp, path.join(SHOT_DIR, '06-restore.png'));
      stepLog('T6', `restored=${!!gone}`);
      record('T6', 'CP-05', 'بازگردانی از پشتیبان مهاجرت', '۲ کار قدیمی + حذف وارداتی', !!gone, `restored=${!!gone}`, img);
    }

    /* T7 — CP-06: حذف کامل دو مرحله‌ای */
    {
      await click('#settingsOpen');
      await waitFor(cdp, `document.getElementById('settingsModal').classList.contains('open')`, 'مودال تنظیمات');
      await click('#wipeBtn'); /* دو confirm پشت‌سرهم — هر دو true */
      await waitFor(cdp, `document.getElementById('settingsModal').classList.contains('open')===false || document.querySelector('#grid .empty')`, 'خالی شدن grid');
      await goto(base + '/');
      await waitFor(cdp, `document.querySelector('#grid .empty')`, 'grid خالی پس از reload');
      const emptyText = await text('#grid .empty');
      const img = await shot(cdp, path.join(SHOT_DIR, '07-wipe.png'));
      stepLog('T7', `empty="${emptyText.trim().slice(0, 40)}"`);
      record('T7', 'CP-06', 'حذف کامل با تأیید دومرحله‌ای', 'grid خالی و پایدار', emptyText.includes('پیدا نشد'), `empty="${emptyText.trim().slice(0, 50)}"`, img);
    }

    /* T8 — BUG-01: ویرایش کار + قفل ثبت تکراری (دوکلیک ⇒ یک کار) */
    const EDIT_TITLE = 'E2E-ویرایشی';
    {
      await click('#add');
      await waitFor(cdp, `document.getElementById('taskModal').classList.contains('open')`, 'مودال ثبت');
      await setVal('#taskTitleSelect', '__custom__', 'change');
      await setVal('#taskCustomTitle', EDIT_TITLE, 'input');
      await click('#taskSave');
      await click('#taskSave'); /* حملهٔ دوبله — باید توسط قفل BUG-01 خنثی شود */
      await waitFor(cdp, `[...document.querySelectorAll('article.card .card-title')].some(b=>b.textContent.includes(${JSON.stringify(EDIT_TITLE)}))`, 'کارت ایجاد شد');
      await click('article.card .card-title');
      await waitFor(cdp, `document.getElementById('taskModal').classList.contains('open')`, 'مودال ویرایش');
      await setVal('#taskTitleSelect', '__custom__', 'change');
      const prefill = await evalJS(cdp, `document.getElementById('taskCustomTitle').value`);
      await setVal('#taskCustomTitle', 'E2E-ویرایشی-۲', 'input');
      await click('#taskSave');
      await waitFor(cdp, `[...document.querySelectorAll('article.card .card-title')].some(b=>b.textContent.includes('E2E-ویرایشی-۲'))`, 'عنوان ویرایش‌شده');
      const cards = await count('article.card');
      const img = await shot(cdp, path.join(SHOT_DIR, '08-edit.png'));
      stepLog('T8', `prefill="${prefill}" cards=${cards}`);
      record('T8', 'CP-02', 'ویرایش کار + قفل ثبت تکراری', 'دوکلیک ⇒ ۱ کار + عنوان ویرایش‌شده اعمال شود', cards === 1, `prefill="${prefill}" (مسیر عنوان آماده=طبیعی) cards=${cards}`, img);
    }

    /* T9 — CP-02: تکمیل کار با تیک و مشاهده در «انجام‌شده» */
    {
      await click('article.card .action.done');
      await waitFor(cdp, `document.querySelector('article.card.completed')`, 'کارت سبز شد');
      await click('button[data-filter="completed"]');
      await waitFor(cdp, `document.querySelectorAll('article.card').length===1`, 'در فیلتر انجام‌شده');
      const stateVal = await evalJS(cdp, `state.tasks[0].state`);
      const img = await shot(cdp, path.join(SHOT_DIR, '09-complete.png'));
      stepLog('T9', `state=${stateVal}`);
      record('T9', 'CP-02', 'تکمیل کار با تیک', 'وضعیت completed + دیده‌شدن در فیلتر انجام‌شده', stateVal === 'completed', `state=${stateVal}`, img);
    }

    /* T10 — CP-02: انتقال به تاریخ جدید + سابقهٔ موکول‌شده + پیگیری مستقل */
    {
      await click('button[data-filter="completed"]');
      await click('article.card .action.done'); /* برگرداندن به فعال (تأیید شیم شده) */
      await click('button[data-filter="all"]');
      await waitFor(cdp, `document.querySelectorAll('article.card').length===1`, 'کار فعال برای انتقال');
      await click('article.card .action.move');
      await waitFor(cdp, `document.getElementById('transferModal').classList.contains('open')`, 'مودال انتقال');
      await click('#transferSave');
      await waitFor(cdp, `document.querySelectorAll('article.card').length===1 && [...document.querySelectorAll('article.card .card-title')].some(b=>b.textContent.includes('پیگیری:'))`, 'پیگیری جدید در فعال‌ها');
      const follow = await evalJS(cdp, `[...document.querySelectorAll('article.card .card-title')].some(b=>b.textContent.includes('پیگیری:'))`);
      const linked = await evalJS(cdp, `state.tasks.filter(t=>t.state==='active').map(t=>t.parentId).filter(Boolean).length`);
      await click('button[data-filter="history"]');
      await waitFor(cdp, `document.querySelectorAll('article.card').length===1`, 'اصلی در سوابق انتقال');
      const img = await shot(cdp, path.join(SHOT_DIR, '10-transfer.png'));
      stepLog('T10', `follow=${follow} linked=${linked}`);
      record('T10', 'CP-02', 'انتقال + پیگیری مستقل + سابقه', 'پیگیری با parentId + اصلی در سوابق', follow && linked === 1, `follow=${follow} linked=${linked}`, img);
    }

    /* T11 — یادآوری: فعال‌سازی آسان با یک لمس + اعلان آزمایشی واقعی */
    {
      await cdp.send('Browser.grantPermissions', { permissions: ['notifications'], origin: base });
      await goto(base + '/');
      await waitFor(cdp, `(document.getElementById('storageStatusLi')||{}).textContent?.includes('IndexedDB')`, 'بوت پس از اعطای مجوز');
      await evalJS(cdp, `(()=>{const R=window.Notification;window.__notifFired=0;window.Notification=function(t,o){window.__notifFired++;return new R(t,o)};window.Notification.permission=R.permission;window.Notification.requestPermission=R.requestPermission.bind(R);return true})()`);
      await click('#notifyBtn');
      await waitFor(cdp, `document.getElementById('notifyBtn').classList.contains('notify-on') && document.getElementById('notifyBtn').textContent.includes('فعال ✓')`, 'دکمه در حالت فعال');
      const fired = await evalJS(cdp, `window.__notifFired`);
      const saved = await evalJS(cdp, `localStorage.getItem('kar_yar_notify')`);
      const perm = await evalJS(cdp, `Notification.permission`);
      const notice = await text('#notice');
      const img = await shot(cdp, path.join(SHOT_DIR, '11-notify.png'));
      stepLog('T11', `fired=${fired} perm=${perm} saved=${saved}`);
      record('T11', 'CP-02+', 'فعال‌سازی آسان یادآوری (یک لمس)', 'اعلان آزمایشی واقعی + حالت فعال دکمه + ذخیرهٔ انتخاب', fired >= 1 && perm === 'granted' && saved === '1' && notice.includes('یادآوری فعال شد'), `fired=${fired} perm=${perm} saved=${saved}`, img);
    }
  } catch (e) {
    let pageState = '';
    try { pageState = await evalJS(cdp, `JSON.stringify({notice:(document.getElementById('notice')||{}).textContent,modalOpen:document.getElementById('taskModal')?.classList.contains('open'),filter:document.querySelector('button[data-filter].active')?.dataset.filter,cards:document.querySelectorAll('article.card').length,titles:[...document.querySelectorAll('article.card .card-title')].map(b=>b.textContent),tasks:(typeof state!=='undefined'?state.tasks:[]).map(t=>({t:t.title,d:t.dueDate,s:t.state,p:t.parentId})),errs:(window.__errs||[]).slice(0,4)})`); } catch (_) { }
    record('FX', '—', 'خطای زیرساخت باتری', '—', false, ((e && e.message || String(e)).slice(0, 200)) + ' PAGE:' + pageState, '');
  } finally {
    if (cdp) cdp.close();
    try { proc.kill(); } catch (_) { }
    await sleep(300);
    try { proc.kill('SIGKILL'); } catch (_) { }
    await rm(profile, { recursive: true, force: true }).catch(() => { });
    await new Promise(res => srv.close(res));
  }

  /* ─── گزارش شواهد ─── */
  const passed = results.filter(r => r.ok).length;
  const ver = process.version;
  const lines = [];
  lines.push(`# شواهد باتری E2E مرورگر واقعی (L4 — TEST-MATRIX ردیف ۴ و ۵) — ${NOW()}`);
  lines.push('');
  lines.push(`- مرورگر: \`${bin}\` (headless، پروفایل یک‌بارمصرف)`);
  lines.push(`- رانر: Node ${ver}، CDP خام روی WebSocket داخلی — صفر وابستگی npm`);
  lines.push(`- رویدادها: واقعی DOM (\`el.click()\`/\`dispatchEvent\` — Trap-04)، آفلاین‌سازی واقعی با Network.emulateNetworkConditions`);
  lines.push(`- اجرا: \`node scripts/e2e/battery.mjs\` (بودجهٔ ماتریس ≤ ۱۵ دقیقه؛ زمان واقعی ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  lines.push('');
  lines.push('| # | مسیر بحرانی | سناریو | انتظار | نتیجه | خروجی ثبت‌شده | شاهد |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of results) {
    lines.push(`| ${r.id} | ${r.cp} | ${r.name} | ${r.expect} | ${r.ok ? '🟢 PASS' : '🔴 FAIL'} | ${r.out.replace(/\|/g, '/')} | ${r.img ? '`docs/evidence/browser/' + r.img + '`' : '—'} |`);
  }
  lines.push('');
  lines.push(`**نتیجه: ${passed}/${results.length} سبز** — ${passed === results.length ? 'باتری E2E کاملاً سبز است.' : 'شکست! پیش از انتشار ادامه ندهید.'}`);
  lines.push('');
  await writeFile(path.join(EVIDENCE_DIR, 'browser-battery.md'), lines.join('\n'), 'utf8');

  for (const r of results) console.error(`${r.id} ${r.ok ? 'PASS' : 'FAIL'} — ${r.name} :: ${r.out}`);
  console.error(`BROWSER-BATTERY: ${passed}/${results.length} GREEN (شواهد → docs/evidence/browser-battery.md)`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(e => { console.error('BATTERY ERROR:', e && e.message); process.exit(2); });
