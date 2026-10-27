/* kar-yar v4 — safe migration: localStorage(yar_kareha_v2) → IndexedDB
   قواعد: پشتیبان داخل همان تراکنش، عدم حذف منبع قدیمی، idempotent، تأیید شمارش */
window.KarMigration = (function () {
  const LEGACY_KEY = 'yar_kareha_v2';
  const BACKUP_KEY = '_migration_backup_v1';
  const FLAG_KEY = '_migration_v1_done';

  /* null = هیچ داده‌ای نیست (fresh)؛ {__invalid:true} = داده هست ولی خراب/ناقص است (failed، نه دور ریختن) */
  function readLegacy() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (raw === null) return null;
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.statuses) && Array.isArray(s.tasks)) return s;
      return { __invalid: true };
    } catch (e) {
      return { __invalid: true };
    }
  }

  function normalizeRecord(t) {
    const r = Object.assign({}, t);
    if (typeof r.id !== 'string' || !r.id) r.id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    if (typeof r.createdAt !== 'string') r.createdAt = new Date().toISOString();
    if (typeof r.updatedAt !== 'string') r.updatedAt = r.createdAt;
    r.schemaVersion = 1;
    if (typeof r.recordVersion !== 'number') r.recordVersion = 1;
    return r;
  }

  /* خروجی: {status:'migrated'|'skipped'|'fresh'|'failed', count?, error?} */
  function run() {
    return KarIDB.getMeta(FLAG_KEY).then(function (flag) {
      if (flag) return { status: 'skipped' };
      const legacy = readLegacy();
      if (legacy === null) return { status: 'fresh' };
      if (legacy.__invalid) return { status: 'failed', error: 'ساختار دادهٔ قدیمی معتبر نیست؛ داده‌ها دست‌نخورده حفظ شده‌اند' };

      const backup = JSON.parse(JSON.stringify(legacy));
      const records = legacy.tasks.map(normalizeRecord);
      const meta = {
        statuses: legacy.statuses,
        taskTitles: Array.isArray(legacy.taskTitles) ? legacy.taskTitles : [],
        events: Array.isArray(legacy.events) ? legacy.events : []
      };

      /* پشتیبان + داده + پرچم موفقیت همه در «یک» تراکنش اتمیک؛ شکست = هیچ‌چیز نوشته نمی‌شود.
         منبع قدیمی localStorage همیشه دست‌نخورده می‌ماند. */
      return KarIDB.atomicWrite(records, [
        [BACKUP_KEY, backup],
        ['app_meta', meta],
        [FLAG_KEY, { at: new Date().toISOString(), count: records.length }]
      ]).then(function () {
        return KarIDB.countTasks().then(function (n) {
          if (n >= records.length) return { status: 'migrated', count: records.length };
          return { status: 'failed', error: 'شمارش رکوردها پس از انتقال مطابقت ندارد' };
        });
      });
    }).catch(function (e) {
      return { status: 'failed', error: (e && e.message) || 'خطای ناشناختهٔ پایگاه‌داده' };
    });
  }

  function getBackup() { return KarIDB.getMeta(BACKUP_KEY); }
  function hasBackup() { return getBackup().then(b => !!b); }

  return { run: run, getBackup: getBackup, hasBackup: hasBackup };
})();
