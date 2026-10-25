# معماری کار یار ۴.۰ (آزمایشی)

## نمای کلی
اپ تک‌صفحه‌ای فارسی/RTL بدون باندلر: `index.html` (UI + منطق اپ) + پنج ماژول جاوااسکریپت مستقل که با آبجکت‌های global (`KarIDB`, `KarRepo`, `KarMigration`, `KarQuota`, `KarLogger`) به اپ متصل می‌شوند. انتخاب no-build برای میزبانی سادهٔ استاتیک (GitHub Pages) و حذف ریسک زنجیرهٔ build در فاز آزمایشی.

## Repository Pattern
اینترفیس فاز اول — `LocalTaskRepository` (js/repository.js):
- `list()`, `get(id)`, `create(r)`, `update(r)`, `delete(id)`, `bulkUpsert(records)`
- توابع سطح اپ: `loadApp()` / `saveApp(state)` — وضعیت اپ {statuses, taskTitles, tasks, events}
- تنها پیاده‌سازی فاز اول همین Repository محلی است. هیچ ApiTaskRepository، stub یا Sync Queue وجود ندارد.

## قرارداد bulkUpsert
بر اساس `id`: رکورد جدید → درج؛ `updatedAt` جدیدتر → جایگزینی؛ مساوی/قدیمی‌تر → نادیده؛ رکورد نامعتبر → رد و شمارش در `summary.invalid`. کل عملیات در یک تراکنش اتمیک است و خروجی {inserted, replaced, ignored, invalid} برمی‌گرداند.

## قرارداد IndexedDB
- نام دیتابیس: `kar-yar-db` — نسخه: 1
- Store `tasks` (keyPath `id`) با ایندکس‌های `by_dueDate`, `by_status`, `by_updatedAt`
- Store `_meta` (keyPath `key`): `app_meta`, `_migration_backup_v1`, `_pre_import_backup`, `_pre_restore_backup`, `_logs`, `_migration_v1_done`
- رکورد Task: `id` (شناسهٔ یکتای اپ — از نسخهٔ قبلی ارث می‌رسد؛ UUID v4 نیست، انحراف مستند)، `schemaVersion:1`، `recordVersion`، `createdAt/updatedAt` (ISO)، `title`, `description`, `dueDate` (تقویمی محلی YYYY-MM-DD — انحراف مستند از ISO-UTC)، `status`, `priority`, `dueTime`, `state`, `expanded`, `parentId`, `history`
- `createdAt` پس از ایجاد ثابت است؛ `updatedAt` با هر تغییر معنایی توسط اپ به‌روز می‌شود؛ `recordVersion` با هر نوشتنِ تغییر واقعی +1 می‌شود. این فیلدها صرفاً نسخه‌بندی رکورد هستند و به معنای همگام‌سازی نیستند.
- سیاست migration: هر تغییر ساختار آینده = افزایش DB version + افزایش `schemaVersion` + تابع مهاجرت مشخص + تست + مستندسازی در همین فایل + مسیر بازگشت.

## مهاجرت localStorage → IndexedDB
ترتیب: تشخیص دادهٔ قدیمی (کلید `yar_kareha_v2`) → اعتبارسنجی ساختار → نوشتن پشتیبان + داده + پرچم موفقیت **در یک تراکنش اتمیک** → تأیید شمارش → ثبت پرچم. 
- منبع قدیمی هرگز حذف نمی‌شود؛ در شکست، اپ به localStorage برمی‌گردد و پیام فارسی نشان می‌دهد.
- idempotent: پرچم `_migration_v1_done` اجرای مجدد را skip می‌کند؛ تراکنش اتمیک هم تکرارِ ناقص غیرممکن می‌کند.
- نقطه‌های بازگشت: پیش از مهاجرت (منبع سالم)، پس از شکست (fallback خودکار)، پس از موفقیت (دکمهٔ «بازگردانی از نسخهٔ قبلی» از `_migration_backup_v1`).

## مدیریت quota و خطا
`KarIDB` خطاها را wrap و نوع QuotaExceeded را برچسب می‌زند؛ `KarQuota` پیام فارسی + بنر خطا + مسیر «خروجی پشتیبان» ارائه می‌دهد؛ UI هرگز موفقیت کاذب نشان نمی‌دهد (بنر خطا تا ذخیرهٔ موفق بعدی می‌ماند). هیچ حذف خودکاری برای آزادسازی فضا انجام نمی‌شود.

## logging
`KarLogger`: بافر حلقوی ۱۰۰ رویداد، ذخیره در `_meta._logs`، فیلتر کلیدهای حساس و کوتاه‌سازی، بدون حلقهٔ خطا، خروجی دانلودشدنی از تنظیمات.

## Service Worker
precache صریح shell (شامل فونت‌ها و آیکون‌ها)؛ راهبرد: ناوبری = شبکه با fallback کش، استاتیک = cache-first، بقیه = stale-while-revalidate؛ `skipWaiting` + `clients.claim` با بنر «نسخه جدید آماده است» و ری‌لود تک‌مرتبهٔ کنترل‌شده.

## انحراف‌های مستند از پرامپت اصلی
1. no-build به‌جای Vite (بدون hash؛ precache دستی)
2. id ها UUID v4 نیستند (سازگاری با دادهٔ موجود؛ ارتقا در نسخهٔ بعد)
3. `dueDate` تقویمی محلی است نه UTC-instant (تقویم جلالی روز-محور است)
4. تست‌های خودکار و Lighthouse در این تحویل اجرا نشده‌اند → docs/roadmap.md
