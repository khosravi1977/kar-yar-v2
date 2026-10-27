/* kar-yar v4 — LocalTaskRepository
   فاز ۲: افزودن انتخاب بین Local و Api بر اساس import.meta.env.VITE_API_BASE_URL
   اینترفیس: list / get / create / update / delete / bulkUpsert (+ loadApp/saveApp برای وضعیت اپ) */
window.KarRepo = (function () {
  let lastSerialized = {}; // id → JSON در آخرین خواندن/نوشتن موفق
  let lastRecordVersion = {}; // id → آخرین recordVersion ثبت‌شده در IDB (منبع حقیقت: store، نه state)

  function wrap(err) {
    err = err || new Error('IndexedDBError');
    err.isIDB = true;
    if (err.name === 'QuotaExceededError') err.isQuota = true;
    return err;
  }

  function isValidRecord(r) {
    return !!r && typeof r === 'object'
      && typeof r.id === 'string' && r.id.length > 0
      && typeof r.title === 'string'
      && (r.updatedAt === undefined || typeof r.updatedAt === 'string')
      && (r.createdAt === undefined || typeof r.createdAt === 'string');
  }

  function norm(rec) {
    const o = Object.assign({}, rec);
    if (typeof o.id !== 'string' || !o.id) o.id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    if (typeof o.createdAt !== 'string') o.createdAt = new Date().toISOString();
    if (typeof o.updatedAt !== 'string') o.updatedAt = o.createdAt;
    if (typeof o.schemaVersion !== 'number') o.schemaVersion = 1;
    if (typeof o.recordVersion !== 'number') o.recordVersion = 1;
    return o;
  }

  function ser(t) { return JSON.stringify(t); }

  function list() { return KarIDB.getAllTasks(); }

  function get(id) {
    return KarIDB.open().then(db => new Promise((res, rej) => {
      const req = db.transaction('tasks').objectStore('tasks').get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => rej(wrap(req.error));
    }));
  }

  /* قرارداد bulkUpsert: id جدید → درج؛ updatedAt جدیدتر → جایگزینی؛ مساوی/قدیمی‌تر → نادیده؛ نامعتبر → رد و شمارش.
     اتمیک در یک تراکنش؛ نتیجه دقیق درج/جایگزینی/نادیده/نامعتبر برمی‌گردد. */
  function bulkUpsert(records) {
    const summary = { inserted: 0, replaced: 0, ignored: 0, invalid: 0 };
    return KarIDB.open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction('tasks', 'readwrite');
      const st = t.objectStore('tasks');
      (records || []).forEach(function (r) {
        if (!isValidRecord(r)) { summary.invalid++; return; }
        const g = st.get(r.id);
        g.onsuccess = function () {
          const ex = g.result;
          if (!ex) { summary.inserted++; st.put(norm(r)); }
          else {
            const nu = typeof r.updatedAt === 'string' ? r.updatedAt : '';
            const eu = typeof ex.updatedAt === 'string' ? ex.updatedAt : '';
            if (nu > eu) { summary.replaced++; st.put(norm(r)); }
            else summary.ignored++;
          }
        };
        g.onerror = function () { summary.invalid++; };
      });
      t.oncomplete = function () { resolve(summary); };
      t.onerror = function () { reject(wrap(t.error)); };
      t.onabort = function () { reject(wrap(t.error || new Error('TxAborted'))); };
    }));
  }

  /* وضعیت کامل اپ را از IDB می‌سازد؛ اگر هیچ داده‌ای نبود null برمی‌گرداند */
  function loadApp() {
    return KarIDB.getAllTasks().then(records => {
      const hasFlagP = KarIDB.getMeta('app_meta');
      return hasFlagP.then(meta => {
        if ((!records || !records.length) && !meta) return null;
        const tasks = (records || []).map(function (r) {
          lastRecordVersion[r.id] = typeof r.recordVersion === 'number' ? r.recordVersion : 0;
          const o = Object.assign({}, r);
          delete o.schemaVersion; delete o.recordVersion;
          lastSerialized[o.id] = ser(o);
          return o;
        });
        const m = meta && meta.value ? meta.value : {};
        return { tasks: tasks, meta: m };
      });
    });
  }

  /* ذخیرهٔ وضعیت اپ: فقط تسک‌هایی که واقعاً تغییر کرده‌اند نوشته می‌شوند (تشخیص با مقایسهٔ محتوا)؛
     recordVersion از آخرین مقدارِ ثبت‌شده در IDB +1 می‌شود (قاعدهٔ نسخه‌بندی رکورد). */
  function saveApp(state) {
    const changed = [];
    const cache = {};
    const rvCache = Object.assign({}, lastRecordVersion);
    state.tasks.forEach(function (t) {
      const s = ser(t);
      cache[t.id] = s;
      if (lastSerialized[t.id] !== s) {
        const rv = (typeof t.recordVersion === 'number' ? t.recordVersion : (lastRecordVersion[t.id] || 0)) + 1;
        rvCache[t.id] = rv;
        const r = Object.assign({}, t, { recordVersion: rv, schemaVersion: 1 });
        changed.push(r);
      }
    });
    const metaEntries = [['app_meta', { statuses: state.statuses, taskTitles: state.taskTitles, events: state.events }]];
    return KarIDB.atomicWrite(changed, metaEntries).then(function () {
      lastSerialized = cache;
      lastRecordVersion = rvCache;
      return { changed: changed.length, quota: false };
    }).catch(function (e) {
      lastSerialized = {}; // دفعهٔ بعد کامل بازنویسی می‌شود
      lastRecordVersion = {};
      throw e;
    });
  }

  /* پشتیبان‌گیری عمومی در _meta (برای import و بازگردانی) */
  function putBackup(key, value) { return KarIDB.putMeta(key, value); }
  function getBackup(key) { return KarIDB.getMeta(key); }

  /* حذف کامل داده‌ها (هر دو store) — فقط با تأیید دو مرحله‌ای از UI */
  function wipeAll() { lastSerialized = {}; lastRecordVersion = {}; return KarIDB.clearAll(); }

  /* پس از بازنویسی کامل stores از بیرون (replaceAllStores) کش تشخیص تغییر باید خالی شود */
  function resetCache() { lastSerialized = {}; lastRecordVersion = {}; }

  /* create/update/delete طبق اینترفیس فاز اول */
  function create(record) {
    if (!isValidRecord(record)) return Promise.reject(wrap(new Error('InvalidRecord')));
    const r = norm(record);
    r.recordVersion = (lastRecordVersion[r.id] || 0) + 1;
    const bare = Object.assign({}, r); delete bare.schemaVersion; delete bare.recordVersion;
    lastSerialized[r.id] = ser(bare);
    lastRecordVersion[r.id] = r.recordVersion;
    return KarIDB.atomicWrite([r], []).then(() => r);
  }
  function update(record) {
    if (!isValidRecord(record)) return Promise.reject(wrap(new Error('InvalidRecord')));
    const r = norm(record);
    r.recordVersion = (lastRecordVersion[r.id] || (typeof record.recordVersion === 'number' ? record.recordVersion : 0)) + 1;
    const bare = Object.assign({}, r); delete bare.schemaVersion; delete bare.recordVersion;
    lastSerialized[r.id] = ser(bare);
    lastRecordVersion[r.id] = r.recordVersion;
    return KarIDB.atomicWrite([r], []).then(() => r);
  }
  function _delete(id) { delete lastSerialized[id]; delete lastRecordVersion[id]; return KarIDB.open().then(db => new Promise((res, rej) => { const t = db.transaction('tasks', 'readwrite'); t.objectStore('tasks').delete(id); t.oncomplete = () => res(true); t.onerror = () => rej(wrap(t.error)); })); }

  return {
    isValidRecord: isValidRecord,
    list: list, get: get, create: create, update: update, delete: _delete,
    bulkUpsert: bulkUpsert,
    loadApp: loadApp, saveApp: saveApp,
    putBackup: putBackup, getBackup: getBackup,
    wipeAll: wipeAll, resetCache: resetCache
  };
})();
