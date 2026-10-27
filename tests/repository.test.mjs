import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv, nowISO } from './helpers/env.mjs';

beforeEach(() => { freshEnv(); });

const rec = (id, updatedAt, extra = {}) => ({ id, title: 'عنوان ' + id, updatedAt, ...extra });

test('قرارداد bulkUpsert: id جدید ⇒ درج', async () => {
  const s = await KarRepo.bulkUpsert([rec('a', '2026-01-01T00:00:00Z')]);
  assert.deepEqual(s, { inserted: 1, replaced: 0, ignored: 0, invalid: 0 });
  assert.equal(await KarIDB.countTasks(), 1);
});

test('قرارداد bulkUpsert: updatedAt جدیدتر ⇒ جایگزینی', async () => {
  await KarRepo.bulkUpsert([rec('a', '2026-01-01T00:00:00Z', { title: 'قدیمی' })]);
  const s = await KarRepo.bulkUpsert([rec('a', '2026-02-01T00:00:00Z', { title: 'جدید' })]);
  assert.equal(s.replaced, 1);
  const got = await KarRepo.get('a');
  assert.equal(got.title, 'جدید');
});

test('قرارداد bulkUpsert: updatedAt مساوی یا قدیمی‌تر ⇒ نادیده', async () => {
  await KarRepo.bulkUpsert([rec('a', '2026-02-01T00:00:00Z', { title: 'مرجع' })]);
  const s1 = await KarRepo.bulkUpsert([rec('a', '2026-02-01T00:00:00Z', { title: 'مساوی' })]);
  const s2 = await KarRepo.bulkUpsert([rec('a', '2026-01-01T00:00:00Z', { title: 'قدیمی' })]);
  assert.equal(s1.ignored, 1); assert.equal(s2.ignored, 1);
  assert.equal((await KarRepo.get('a')).title, 'مرجع');
});

test('قرارداد bulkUpsert: رکورد نامعتبر ⇒ رد و شمارش، بدون توقف بقیه', async () => {
  const s = await KarRepo.bulkUpsert([
    null,
    { title: 'بدون id', updatedAt: nowISO() },
    { id: 'b', updatedAt: nowISO() }, // بدون title
    { id: 42, title: 'id غیر رشته', updatedAt: nowISO() },
    rec('c', nowISO())
  ]);
  assert.equal(s.invalid, 4);
  assert.equal(s.inserted, 1);
  assert.equal((await KarRepo.get('c')).title, 'عنوان c');
});

test('norm: فیلدهای نسخه‌بندی را کامل می‌کند (schemaVersion=1، recordVersion=1، timestampها)', async () => {
  await KarRepo.bulkUpsert([{ id: 'n1', title: 'کم' }]);
  const got = await KarRepo.get('n1');
  assert.equal(got.schemaVersion, 1);
  assert.equal(got.recordVersion, 1);
  assert.equal(typeof got.createdAt, 'string');
  assert.equal(typeof got.updatedAt, 'string');
});

test('saveApp/loadApp: رفت و برگشت کامل وضعیت اپ', async () => {
  const state = {
    statuses: ['برنامه‌ریزی'],
    taskTitles: ['تماس'],
    events: [{ id: 'e1', type: 'ایجاد' }],
    tasks: [Object.assign(rec('t1', nowISO()), { description: 'متن' })]
  };
  await KarRepo.saveApp(state);
  const loaded = await KarRepo.loadApp();
  assert.equal(loaded.tasks.length, 1);
  assert.equal(loaded.tasks[0].description, 'متن');
  assert.deepEqual(loaded.meta.statuses, ['برنامه‌ریزی']);
  assert.deepEqual(loaded.meta.events, [{ id: 'e1', type: 'ایجاد' }]);
});

test('saveApp: تغییر محتوایی بدون updatedAt ⇒ تشخیص تغییر + recordVersion+1', async () => {
  const state = { statuses: [], taskTitles: [], events: [], tasks: [rec('t1', nowISO())] };
  await KarRepo.saveApp(state);
  const before = await KarRepo.get('t1');
  state.tasks[0].expanded = true; // تغییر بدون bump کردن updatedAt
  const r = await KarRepo.saveApp(state);
  assert.equal(r.changed, 1);
  const after = await KarRepo.get('t1');
  assert.equal(after.recordVersion, before.recordVersion + 1);
  assert.equal(after.expanded, true);
});

test('saveApp: بدون تغییر ⇒ صفر نوشتن', async () => {
  const state = { statuses: [], taskTitles: [], events: [], tasks: [rec('t1', nowISO())] };
  await KarRepo.saveApp(state);
  const r = await KarRepo.saveApp(state);
  assert.equal(r.changed, 0);
});

test('saveApp در شکست: cache باطل می‌شود تا نوشتن بعدی کامل باشد', async () => {
  const state = { statuses: [], taskTitles: [], events: [], tasks: [rec('t1', nowISO())] };
  await KarRepo.saveApp(state);
  const factory = globalThis.__factory;
  factory.failNextPut();
  await assert.rejects(() => KarRepo.saveApp(Object.assign({}, state, { tasks: [Object.assign(rec('t1', nowISO()), { title: 'جدید' })] })));
  const r = await KarRepo.saveApp(Object.assign({}, state, { tasks: [Object.assign(rec('t1', nowISO()), { title: 'جدید' })] }));
  assert.ok(r.changed >= 1, 'بعد از شکست، بازنویسی کامل انجام شود');
  assert.equal((await KarRepo.get('t1')).title, 'جدید');
});

test('resetCache پس از بازنویسی بیرونی ⇒ نوشتن کامل', async () => {
  const state = { statuses: [], taskTitles: [], events: [], tasks: [rec('t1', nowISO())] };
  await KarRepo.saveApp(state);
  await KarIDB.atomicWrite([Object.assign(rec('t1', nowISO()), { title: 'بیرونی' })], []);
  KarRepo.resetCache();
  state.tasks[0].title = 'بیرونی';
  const r = await KarRepo.saveApp(state);
  assert.equal(r.changed, 1, 'با کش خالی، تغییر بیرونی دیده می‌شود');
});

test('create/update/delete طبق اینترفیس فاز اول', async () => {
  const created = await KarRepo.create(rec('c1', nowISO()));
  assert.equal(created.recordVersion, 1);
  const updated = await KarRepo.update(Object.assign(rec('c1', nowISO()), { title: 'دو' }));
  assert.equal(updated.recordVersion, 2);
  assert.equal((await KarRepo.get('c1')).title, 'دو');
  await KarRepo.delete('c1');
  assert.equal(await KarRepo.get('c1'), null);
});

test('create با رکورد نامعتبر ⇒ رد شدن', async () => {
  await assert.rejects(() => KarRepo.create({ noid: true }));
});

test('isValidRecord: مرزهای اعتبارسنجی', () => {
  assert.equal(KarRepo.isValidRecord(null), false);
  assert.equal(KarRepo.isValidRecord({ id: '', title: 'x' }), false);
  assert.equal(KarRepo.isValidRecord({ id: 'a' }), false);
  assert.equal(KarRepo.isValidRecord({ id: 'a', title: 'x' }), true);
});

test('wipeAll: همه‌چیز خالی می‌شود', async () => {
  await KarRepo.saveApp({ statuses: ['س'], taskTitles: [], events: [], tasks: [rec('t1', nowISO())] });
  await KarRepo.wipeAll();
  assert.equal(await KarIDB.countTasks(), 0);
  assert.equal(await KarIDB.getMeta('app_meta'), undefined);
});
