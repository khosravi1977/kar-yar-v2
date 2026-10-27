/* Fake IndexedDB — hermetic, deterministic, atomic (buffered writes, abort drops them).
   فقط همان سطحی را پیاده می‌کند که js/idb.js استفاده می‌کند. */
class FakeRequest {
  constructor() { this.result = undefined; this.error = null; this.onsuccess = null; this.onerror = null; }
  _ok(v) { this.result = v; queueMicrotask(() => { if (this.onsuccess) this.onsuccess({ target: this }); }); }
  _fail(e) { this.error = e; queueMicrotask(() => { if (this.onerror) this.onerror({ target: this }); }); }
}

class FakeStore {
  constructor(db, name, keyPath) { this.db = db; this.name = name; this.keyPath = keyPath; this.data = db.data.get(name); this.indexes = db.indexDefs.get(name) || {}; }
  _clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  get(k) { const req = new FakeRequest(); const rec = this.data.get(k); queueMicrotask(() => req._ok(rec === undefined ? undefined : this._clone(rec))); return req; }
  put(rec) {
    const req = new FakeRequest(); const tx = this.tx;
    queueMicrotask(() => {
      try {
        if (this.keyPath) {
          const k = rec ? rec[this.keyPath] : undefined;
          if (typeof k !== 'string' || !k) throw Object.assign(new Error('DataError: invalid key'), { name: 'DataError' });
        }
        if (this.db.__failNextPut > 0) { this.db.__failNextPut--; throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }); }
        const val = this._clone(rec);
        tx.ops.push(() => this.data.set(rec[this.keyPath], val));
        req._ok(rec[this.keyPath]);
      } catch (e) { tx._fail(e); req._fail(e); }
    });
    return req;
  }
  getAll() { const req = new FakeRequest(); const vals = [...this.data.values()].map(v => this._clone(v)); queueMicrotask(() => req._ok(vals)); return req; }
  count() { const req = new FakeRequest(); queueMicrotask(() => req._ok(this.data.size)); return req; }
  clear() { const req = new FakeRequest(); const tx = this.tx; queueMicrotask(() => { tx.ops.push(() => this.data.clear()); req._ok(undefined); }); return req; }
  delete(k) { const req = new FakeRequest(); const tx = this.tx; queueMicrotask(() => { tx.ops.push(() => this.data.delete(k)); req._ok(undefined); }); return req; }
  createIndex(name, keyPath) { this.db.indexDefs.get(this.name)[name] = { name, keyPath }; }
  index(name) { return this.db.indexDefs.get(this.name)[name]; }
}

class FakeTx {
  constructor(db, names, mode) {
    this.db = db; this.names = names; this.mode = mode; this.error = null;
    this._settled = false; this.ops = [];
    setTimeout(() => this._complete(), 0);
  }
  objectStore(name) {
    if (this._settled) throw new Error('TransactionFinished');
    if (!this.names.includes(name) || !this.db.stores[name]) throw new Error('NotFoundError');
    const s = new FakeStore(this.db, name, this.db.keyPaths.get(name));
    s.tx = this;
    return s;
  }
  _complete() { if (this._settled) return; this._settled = true; for (const op of this.ops) op(); if (this.oncomplete) this.oncomplete({ target: this }); }
  _fail(e) { if (this._settled) return; this._settled = true; this.ops = []; this.error = e; if (this.onabort) this.onabort({ target: this }); if (this.onerror) this.onerror({ target: this }); }
  abort() { this._fail(Object.assign(new Error('AbortError'), { name: 'AbortError' })); }
}

class FakeDB {
  constructor(name, version) {
    this.name = name; this.version = version;
    this.stores = {}; // فقط از مسیر upgrade (createObjectStore) ساخته می‌شوند — مثل IDB واقعی
    this.data = new Map();
    this.keyPaths = new Map();
    this.indexDefs = new Map();
    this.objectStoreNames = { contains: n => !!this.stores[n] };
    this.__failNextPut = 0;
  }
  createObjectStore(name, opts) {
    this.stores[name] = { __store: true };
    this.data.set(name, new Map());
    this.keyPaths.set(name, (opts && opts.keyPath) || null);
    this.indexDefs.set(name, {});
    return new FakeStore(this, name, this.keyPaths.get(name));
  }
  transaction(names, mode) { return new FakeTx(this, [].concat(names), mode || 'readonly'); }
}

export class FakeIDBFactory {
  constructor() { this.dbs = new Map(); this.__failNextPut = 0; }
  get indexedDB() {
    const self = this;
    return {
      open(name, version) {
        const req = new FakeRequest();
        queueMicrotask(() => {
          let db = self.dbs.get(name);
          let needUpgrade = false;
          if (!db) { db = new FakeDB(name, version); self.dbs.set(name, db); needUpgrade = true; }
          else if (version > db.version) { db.version = version; needUpgrade = true; }
          const ev = { target: { result: db } };
          if (needUpgrade && req.onupgradeneeded) req.onupgradeneeded(ev);
          req.result = db;
          if (req.onsuccess) req.onsuccess({ target: req });
        });
        return req;
      },
      databases() { return Promise.resolve([...self.dbs.entries()].map(([n, d]) => ({ name: n, version: d.version }))); }
    };
  }
  reset() { this.dbs.clear(); }
  failNextPut() {
    for (const db of this.dbs.values()) db.__failNextPut = 1;
  }
}
