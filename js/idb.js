/* kar-yar v4 — IndexedDB wrapper
   Database: kar-yar-db (v1) — stores: tasks(keyPath:id), _meta(keyPath:key) */
window.KarIDB = (function () {
  const DB_NAME = 'kar-yar-db', DB_VERSION = 1;
  let dbPromise = null;

  function wrap(err) {
    err = err || new Error('IndexedDBError');
    err.isIDB = true;
    if (err.name === 'QuotaExceededError') err.isQuota = true;
    return err;
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tasks')) {
          const s = db.createObjectStore('tasks', { keyPath: 'id' });
          s.createIndex('by_dueDate', 'dueDate', { unique: false });
          s.createIndex('by_status', 'status', { unique: false });
          s.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('_meta')) {
          db.createObjectStore('_meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { dbPromise = null; reject(wrap(req.error)); };
      req.onblocked = function () { dbPromise = null; reject(wrap(new Error('IndexedDBBlocked'))); };
    });
    return dbPromise;
  }

  function reqP(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(wrap(req.error)); };
    });
  }

  function getMeta(key) {
    return open().then(db => reqP(db.transaction('_meta').objectStore('_meta').get(key)));
  }

  function putMeta(key, value) {
    return open().then(db => new Promise(function (resolve, reject) {
      const t = db.transaction('_meta', 'readwrite');
      t.objectStore('_meta').put({ key: key, value: value });
      t.oncomplete = function () { resolve(true); };
      t.onerror = function () { reject(wrap(t.error)); };
      t.onabort = function () { reject(wrap(t.error)); };
    }));
  }

  /* atomic multi-store write: taskRecords → tasks store, metaEntries → _meta store.
     هر خطا کل تراکنش را abort می‌کند؛ هیچ نوشتن نیمه‌کاره‌ای باقی نمی‌ماند. */
  function atomicWrite(taskRecords, metaEntries) {
    return open().then(db => new Promise(function (resolve, reject) {
      const t = db.transaction(['tasks', '_meta'], 'readwrite');
      const ts = t.objectStore('tasks'), ms = t.objectStore('_meta');
      try {
        (taskRecords || []).forEach(r => ts.put(r));
        (metaEntries || []).forEach(en => ms.put({ key: en[0], value: en[1] }));
      } catch (e) { try { t.abort(); } catch (_) {} reject(wrap(e)); return; }
      t.oncomplete = function () { resolve(true); };
      t.onerror = function () { reject(wrap(t.error)); };
      t.onabort = function () { reject(wrap(t.error || new Error('TxAborted'))); };
    }));
  }

  function getAllTasks() {
    return open().then(db => reqP(db.transaction('tasks').objectStore('tasks').getAll()));
  }
  function countTasks() {
    return open().then(db => reqP(db.transaction('tasks').objectStore('tasks').count()));
  }
  function clearAll() {
    return open().then(db => new Promise(function (resolve, reject) {
      const t = db.transaction(['tasks', '_meta'], 'readwrite');
      t.objectStore('tasks').clear();
      t.objectStore('_meta').clear();
      t.oncomplete = function () { resolve(true); };
      t.onerror = function () { reject(wrap(t.error)); };
      t.onabort = function () { reject(wrap(t.error)); };
    }));
  }

  return { open: open, getMeta: getMeta, putMeta: putMeta, getAllTasks: getAllTasks, countTasks: countTasks, atomicWrite: atomicWrite, clearAll: clearAll };
})();
