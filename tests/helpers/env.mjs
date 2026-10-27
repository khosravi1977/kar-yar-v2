/* hermetic env: globals شیم‌شده + لودر ماژول‌ها (هر فراخوانی = محیط تازه) */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeIDBFactory } from './fake-idb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export { ROOT };

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(String(k), String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

export function freshEnv() {
  const factory = new FakeIDBFactory();
  globalThis.window = globalThis;
  globalThis.indexedDB = factory.indexedDB;
  globalThis.localStorage = new FakeStorage();
  globalThis.location = { protocol: 'https:', hostname: 'tests.local', pathname: '/' };
  for (const g of ['KarIDB', 'KarRepo', 'KarMigration', 'KarQuota', 'KarLogger']) delete globalThis[g];
  for (const rel of ['js/idb.js', 'js/quota.js', 'js/logger.js', 'js/migration.js', 'js/repository.js']) loadModule(rel);
  globalThis.__factory = factory;
  return factory;
}

export function loadModule(rel) {
  const code = readFileSync(path.join(ROOT, rel), 'utf8');
  new Function(code)();
}

export const nowISO = () => '2026-10-26T10:00:00.000Z';
export function legacyState(n = 3) {
  const tasks = [];
  for (let i = 0; i < n; i++) {
    tasks.push({
      id: 'task' + (i + 1), title: 'کار شماره ' + (i + 1), description: 'توضیح ' + i,
      status: 'برنامه‌ریزی', dueDate: '2026-11-0' + (i + 1), dueTime: i === 0 ? '10:00' : '',
      priority: 'normal', state: 'active', expanded: false,
      createdAt: nowISO(), updatedAt: nowISO(), parentId: null, history: []
    });
  }
  return {
    statuses: ['برنامه‌ریزی', 'تکمیل‌شده'],
    taskTitles: ['تماس تلفنی', 'خرید'],
    events: [{ id: 'ev1', taskId: 'task1', title: 'کار شماره ۱', type: 'ایجاد کار', note: '', at: nowISO() }],
    tasks
  };
}
