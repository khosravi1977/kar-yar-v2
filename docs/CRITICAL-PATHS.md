# CRITICAL-PATHS — کار یار ۴.۰
مسیرهایی که خرابی‌شان فاجعه‌بار است (Master Test Firewall L0). هر مسیر یک شناسه دارد و به ≥۱ گارد/اسموک نگاشت شده (قاعدهٔ regression-replay).

| ID | مسیر بحرانی | اثر خرابی | پوشش (گارد/تست) |
|---|---|---|---|
| CP-01 | بوت + مهاجرت localStorage→IndexedDB بدون از دست رفتن داده | از دست رفتن کل اطلاعات کاربر | tests/migration.test.mjs + smoke-fast (پرچم مهاجرت) |
| CP-02 | ایجاد/ویرایش کار و ذخیرهٔ پایدار در IDB | کارها ذخیره نمی‌شوند | tests/repository.test.mjs + browser-e2e |
| CP-03 | بارگذاری آفلاین با Service Worker | اپ بدون اینترنت باز نمی‌شود | smoke-fast (SWR shell) + browser-e2e آفلاین |
| CP-04 | خروجی/ورودی پشتیبان (schemaVersion:1 + legacy) | بازیابی ناممکن / خراب شدن داده با import بد | tests (اعتبارسنجی) + browser-e2e import |
| CP-05 | بازگردانی از پشتیبان مهاجرت (`_migration_backup_v1`) | آخرین راه نجات داده | browser-e2e restore |
| CP-06 | حذف کامل داده‌ها با تأیید دومرحله‌ای | حذف ناخواستهٔ همهٔ داده | browser-e2e wipe |
| CP-07 | ثبت صحیح Service Worker و precache کامل | صفحات نیمه‌کاره در آفلاین | check-sw-precache |
| CP-08 | آیکون‌ها و manifest معتبر (نصب‌پذیری PWA) | اپ نصب نمی‌شود | check-manifest |

## جدول کلاس‌های خطا (از خطاهای واقعی گذشته — کارِ لایهٔ L0)
| کلاس | نمونهٔ واقعی در این پروژه | گارد/تست پاسخگو |
|---|---|---|
| خرابی خاموش زیرماژول (reference ناموجود) | `putMeta` در idb.js تعریف نشده بود → `KarIDB` ساخته نشد → اپ روی «در حال بررسی…» قفل شد | `check-storage-contract` + tests/idb.test.mjs |
| سرو نسخهٔ کهنه از کش | پس از اصلاح idb.js، SW نسخهٔ قدیمی را می‌داد | `check-sw-precache` + راهبرد SWR + دو-رفرش مستند |
| بی‌احتیاطی در لایهٔ داده | ریسک deleteDatabase در مسیر مهاجرت | `check-migration-safety` |
| فرسایش سکوت فایل‌های حیاتی | حذف تصادفی دکمه/فیلتر از index.html | smoke-fast (فهرست دقیق DOM بحرانی) |
| حذف خاموش تست‌ها | — (پیشگیرانه) | `check-test-floor` |
| سبزسازی مصنوعی CI | — (پیشگیرانه) | meta-guard R3 |
