# COUPLING-MAP — کار یار ۴.۰
نقشهٔ وابستگی ماژول‌ها و جفت‌شدگی‌های پنهان (Master Test Firewall L0).

## گراف وابستگی (global-attachment: window.Kar*)
```
index.html (UI + منطق اپ)
  ├─ خواندن: KarIDB, KarRepo, KarMigration, KarQuota, KarLogger
  └─ ترتیب لود: idb.js → quota.js → logger.js → migration.js → repository.js → inline-app
migration.js ──► KarIDB (atomicWrite/getMeta/countTasks)
repository.js ─► KarIDB (همهٔ عملیات store)
quota.js ─────► KarLogger (log در show) ; UI callback (showNotice/banner از attach)
logger.js ────► KarIDB (putMeta '_logs')
idb.js ───────► هیچ (پایین‌ترین لایه)
```

## جفت‌شدگی‌های پنهان (hidden couplings)
| # | جفت‌شدگی | ریسک | کنترل |
|---|---|---|---|
| H1 | همهٔ ماژول‌ها از طریق `window.Kar*` به هم وصل‌اند؛ نبودِ هر global در زمان اجرا = ReferenceError خاموش | خرابی خاموش زیرماژول (کلاس واقعی putMeta) | ترتیب لود تگ‌های script + `check-storage-contract` + tests/idb |
| H2 | `KarRepo.saveApp` کش `lastSerialized` را با محتوای سریالیزه‌شدهٔ تسک‌ها مقایسه می‌کند؛ هر تغییر بیرونیِ stores بدون `resetCache()` باعث skip شدن نوشتن می‌شود | به‌روزرسانیِ گم‌شده | `resetCache` در wipeAll/replaceAllStores + تست saveApp/loadApp |
| H3 | `storageMode` در index.html تصمیم می‌گیرد localStorage یا IDB؛ تا پایان boot حالت 'pending' است | نوشتن در مسیر اشتباه پیش از boot | تست‌های migration (وضعیت‌های failed/fresh/skipped) |
| H4 | mirror سازی localStorage پس از `replaceAllStores` — منبع قدیمی باید با IDB هم‌قسمت بماند وگرنه مهاجرت مجدد دادهٔ کهنه برمی‌گرداند | رگرسیون داده | تست migration: `legacyStillThere` + سازگاری mirror |
| H5 | ماژول‌های js نباید DOM بشناسند (لایهٔ دادهٔ خالص)؛ نفوذ `document.*` = شکست مرز | تست‌ناپذیری | `check-js-purity` |
