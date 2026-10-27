import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshEnv, legacyState } from './helpers/env.mjs';

beforeEach(() => { freshEnv(); });

const seed = () => localStorage.setItem('yar_kareha_v2', JSON.stringify(legacyState(3)));

test('CP-01: مهاجرت موفق — داده، پشتیبان، پرچم، منبع دست‌نخورده', async () => {
  seed();
  const r = await KarMigration.run();
  assert.equal(r.status, 'migrated');
  assert.equal(r.count, 3);
  assert.equal(await KarIDB.countTasks(), 3);
  const backup = await KarMigration.getBackup();
  assert.equal(backup.key, '_migration_backup_v1');
  assert.equal(backup.value.tasks.length, 3);
  assert.deepEqual(backup.value.statuses, ['برنامه‌ریزی', 'تکمیل‌شده']);
  const flag = await KarIDB.getMeta('_migration_v1_done');
  assert.equal(flag.value.count, 3);
  assert.ok(localStorage.getItem('yar_kareha_v2'), 'منبع قدیمی حذف نمی‌شود');
  const meta = await KarIDB.getMeta('app_meta');
  assert.deepEqual(meta.value.statuses, ['برنامه‌ریزی', 'تکمیل‌شده']);
  assert.equal(meta.value.events.length, 1);
});

test('CP-01: اجرای مجدد مهاجرت ⇒ skip (idempotent، بدون تکثیر)', async () => {
  seed();
  await KarMigration.run();
  const r2 = await KarMigration.run();
  assert.equal(r2.status, 'skipped');
  assert.equal(await KarIDB.countTasks(), 3, 'تکثیر رکورد ممنوع');
});

test('بدون دادهٔ قدیمی ⇒ fresh و بدون پرچم', async () => {
  const r = await KarMigration.run();
  assert.equal(r.status, 'fresh');
  assert.equal(await KarIDB.getMeta('_migration_v1_done'), undefined);
  assert.equal(await KarIDB.countTasks(), 0);
});

test('ساختار خراب legacy ⇒ failed و هیچ نوشتنی در IDB', async () => {
  localStorage.setItem('yar_kareha_v2', JSON.stringify({ foo: 'bar' }));
  const r = await KarMigration.run();
  assert.equal(r.status, 'failed');
  assert.ok(r.error);
  assert.equal(await KarIDB.countTasks(), 0);
  assert.equal(await KarIDB.getMeta('_migration_backup_v1'), undefined);
  assert.ok(localStorage.getItem('yar_kareha_v2'), 'منبع خراب هم دور ریخته نمی‌شود');
});

test('شکست وسط نوشتن ⇒ failed، IDB خالی، منبع سالم (اتمیک + rollback)', async () => {
  seed();
  const orig = KarIDB.atomicWrite.bind(KarIDB);
  KarIDB.atomicWrite = () => Promise.reject(Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError', isQuota: true }));
  const r = await KarMigration.run();
  KarIDB.atomicWrite = orig;
  assert.equal(r.status, 'failed');
  assert.equal(await KarIDB.countTasks(), 0);
  assert.ok(JSON.parse(localStorage.getItem('yar_kareha_v2')).tasks.length === 3, 'منبع دست‌نخورده');
});

test('نرمال‌سازی رکوردها در مهاجرت: timestamp و نسخه‌ها کامل می‌شوند', async () => {
  const s = legacyState(1);
  delete s.tasks[0].createdAt; delete s.tasks[0].updatedAt;
  localStorage.setItem('yar_kareha_v2', JSON.stringify(s));
  await KarMigration.run();
  const t = (await KarIDB.getAllTasks())[0];
  assert.equal(t.schemaVersion, 1);
  assert.equal(t.recordVersion, 1);
  assert.equal(typeof t.createdAt, 'string');
  assert.equal(typeof t.updatedAt, 'string');
});

test('hasBackup پس از مهاجرت true و پیش از آن false', async () => {
  assert.equal(await KarMigration.hasBackup(), false);
  seed();
  await KarMigration.run();
  assert.equal(await KarMigration.hasBackup(), true);
});

test('id نامعتبر در legacy ⇒ نرمال‌سازی می‌شود (تسک دور ریخته نمی‌شود)', async () => {
  const s = legacyState(2);
  delete s.tasks[1].id;
  localStorage.setItem('yar_kareha_v2', JSON.stringify(s));
  const r = await KarMigration.run();
  assert.equal(r.status, 'migrated');
  assert.equal(r.count, 2);
  const ids = (await KarIDB.getAllTasks()).map(t => t.id);
  assert.ok(ids.every(id => typeof id === 'string' && id.length > 0));
});
