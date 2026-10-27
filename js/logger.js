/* kar-yar v4 — logger: بافر حلقوی ۱۰۰ رویداد + ذخیرهٔ پایدار در IndexedDB (بدون دادهٔ حساس) */
window.KarLogger = (function () {
  const MAX = 100;
  let buf = [];
  let flushTimer = null;
  const SENSITIVE = ['description', 'note', 'body', 'token', 'password', 'history'];

  function safe(v, depth) {
    if (depth > 2) return '[…]';
    if (v == null) return v;
    if (typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.length > 200 ? v.slice(0, 200) + '…' : v;
    if (Array.isArray(v)) return v.slice(0, 20).map(x => safe(x, depth + 1));
    if (typeof v === 'object') {
      const o = {};
      Object.keys(v).slice(0, 20).forEach(k => { o[k] = SENSITIVE.indexOf(k) >= 0 ? '[مخفی]' : safe(v[k], depth + 1); });
      return o;
    }
    return String(v).slice(0, 80);
  }

  function flush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      KarIDB.putMeta('_logs', { at: new Date().toISOString(), entries: buf.slice(-MAX) })
        .catch(function () { /* شکست ثبت لاگ هرگز وارد حلقه نمی‌شود */ });
    }, 1500);
  }

  function isDev() {
    return location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }

  function log(level, message, context) {
    const e = { at: new Date().toISOString(), level: level, message: String(message).slice(0, 200) };
    if (context !== undefined) e.ctx = safe(context, 0);
    buf.push(e);
    if (buf.length > MAX) buf = buf.slice(-MAX);
    if (isDev() && window.console) {
      const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[fn]('[kar-yar]', message, context || '');
    }
    flush();
  }

  function init() {
    return KarIDB.getMeta('_logs').then(function (rec) {
      if (rec && rec.value && Array.isArray(rec.value.entries)) buf = rec.value.entries.slice(-MAX);
    }).catch(function () { });
  }

  function exportText() {
    return JSON.stringify({ app: 'kar-yar', exportedAt: new Date().toISOString(), entries: buf }, null, 2);
  }

  return { log: log, init: init, exportText: exportText };
})();
