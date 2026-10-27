import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv } from './helpers/env.mjs';

beforeEach(() => { freshEnv(); });

test('L3: open دیتابیس را با هر دو store و ایندکس‌ها می‌سازد', async () => {
  await KarIDB.open();
  const db = globalThis.__factory.dbs.get('kar-yar-db');
  assert.equal(db.name, 'kar-yar-db');
  assert.deepEqual([...db.data.keys()].sort(), ['_meta', 'tasks']);
  assert.equal(db.keyPaths.get('tasks'), 'id');
  assert.deepEqual(Object.keys(db.indexDefs.get('tasks')).sort(), ['by_dueDate', 'by_status', 'by_updatedAt']);
});

test('L3: putMeta/getMeta رفت و برگشت صحیح', async () => {
  await KarIDB.putMeta('app_meta', { statuses: ['الف'], events: [] });
  const got = await KarIDB.getMeta('app_meta');
  assert.deepEqual(got.value, { statuses: ['الف'], events: [] });
  assert.equal(got.key, 'app_meta');
});

test('L3: getMeta کلید ناموجود = undefined', async () => {
  assert.equal(await KarIDB.getMeta('nothing'), undefined);
});

test('L3: atomicWrite هم تسک و هم متا را می‌نویسد', async () => {
  await KarIDB.atomicWrite(
    [{ id: 't1', title: 'یک', updatedAt: '2026-01-01T00:00:00Z' }],
    [['app_meta', { statuses: [], taskTitles: [], events: [] }]]
  );
  assert.equal(await KarIDB.countTasks(), 1);
  assert.ok(await KarIDB.getMeta('app_meta'));
});

test('L3: شکست در put ⇒ تراکنش abort و هیچ نوشتن نیمه‌کاره‌ای باقی نمی‌ماند (اتمیک)', async () => {
  const factory = freshEnv();
  await KarIDB.atomicWrite([{ id: 'seed', title: 'اولیه' }], []); // دیتابیس ساخته شود
  factory.failNextPut();
  try {
    await KarIDB.atomicWrite(
      [{ id: 'ok1', title: 'سالم' }, { id: 'bad2', title: 'بد' }],
      [['app_meta', { statuses: ['X'] }]]
    );
    assert.fail('باید رد می‌شد');
  } catch (e) {
    assert.ok(e, 'خطا پرتاب شد');
  }
  assert.equal(await KarIDB.countTasks(), 1, 'فقط تسک اولیه مانده باشد');
  assert.equal(await KarIDB.getMeta('app_meta'), undefined, 'متا هم نوشته نشده باشد');
});

test('L3: getAllTasks کپی است (جهش خروجی به store آسیب نمی‌زند)', async () => {
  await KarIDB.atomicWrite([{ id: 't1', title: 'اصلی' }], []);
  const all = await KarIDB.getAllTasks();
  all[0].title = 'دستکاری';
  const again = await KarIDB.getAllTasks();
  assert.equal(again[0].title, 'اصلی');
});

test('L3: atomicWrite با clearTasks ⇒ جایگزینی کامل، نه جمع‌شدن (باگ E2E: رستورشده‌ها)', async () => {
  await KarIDB.atomicWrite([{ id: 'a', title: 'قدیمی۱' }, { id: 'b', title: 'قدیمی۲' }], []);
  await KarIDB.atomicWrite([{ id: 'c', title: 'جدید' }], [], { clearTasks: true });
  const all = await KarIDB.getAllTasks();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, 'c');
});

test('L3: clearAll هر دو store را خالی می‌کند', async () => {
  await KarIDB.atomicWrite([{ id: 't1', title: 'یک' }], [['app_meta', { x: 1 }]]);
  await KarIDB.clearAll();
  assert.equal(await KarIDB.countTasks(), 0);
  assert.equal(await KarIDB.getMeta('app_meta'), undefined);
});
