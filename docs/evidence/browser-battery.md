# شواهد باتری E2E مرورگر واقعی (L4 — TEST-MATRIX ردیف ۴ و ۵) — 2026-10-27T22:02:33.246Z

- مرورگر: `C:\Program Files\Google\Chrome\Application\chrome.exe` (headless، پروفایل یک‌بارمصرف)
- رانر: Node v24.18.0، CDP خام روی WebSocket داخلی — صفر وابستگی npm
- رویدادها: واقعی DOM (`el.click()`/`dispatchEvent` — Trap-04)، آفلاین‌سازی واقعی با Network.emulateNetworkConditions
- اجرا: `node scripts/e2e/battery.mjs` (بودجهٔ ماتریس ≤ ۱۵ دقیقه؛ زمان واقعی 37.5s)

| # | مسیر بحرانی | سناریو | انتظار | نتیجه | خروجی ثبت‌شده | شاهد |
|---|---|---|---|---|---|---|
| T1 | CP-01 | بوت + مهاجرت localStorage→IndexedDB | پرچم IndexedDB + اعلان انتقال + ۲ کار | 🟢 PASS | notice="اطلاعات شما به پایگاه‌دادهٔ جدید منتقل شد (2 کار). داده‌های قبلی هم به‌عنوان پشتیبان حفظ ش" cards=2 | `docs/evidence/browser/01-migration.png` |
| T2 | CP-02 | ایجاد کار (مودال + ذخیره) | کارت "E2E-تسک-جدید" + پرش فیلتر به «امروز» | 🟢 PASS | cards=1 onToday=true | `docs/evidence/browser/02-create.png` |
| T3 | CP-02 | پایداری کارها پس از reload | ۳ کار شامل کار جدید | 🟢 PASS | persisted=true | `docs/evidence/browser/03-persisted.png` |
| T4 | CP-03 | بارگذاری آفلاین کامل (شبکه قطع) | SW کنترل + رندر از کش | 🟢 PASS | swController=true cards=3 | `docs/evidence/browser/04-offline.png` |
| T5 | CP-04 | ورودی پشتیبان (schemaVersion:1) | اعلان ادغام + ۴ کار | 🟢 PASS | cards=4 | `docs/evidence/browser/05-import.png` |
| T6 | CP-05 | بازگردانی از پشتیبان مهاجرت | ۲ کار قدیمی + حذف وارداتی | 🟢 PASS | restored=true | `docs/evidence/browser/06-restore.png` |
| T7 | CP-06 | حذف کامل با تأیید دومرحله‌ای | grid خالی و پایدار | 🟢 PASS | empty="در این بخش کاری پیدا نشد." | `docs/evidence/browser/07-wipe.png` |
| T8 | CP-02 | ویرایش کار + قفل ثبت تکراری | دوکلیک ⇒ ۱ کار + عنوان ویرایش‌شده اعمال شود | 🟢 PASS | prefill="" (مسیر عنوان آماده=طبیعی) cards=1 | `docs/evidence/browser/08-edit.png` |
| T9 | CP-02 | تکمیل کار با تیک | وضعیت completed + دیده‌شدن در فیلتر انجام‌شده | 🟢 PASS | state=completed | `docs/evidence/browser/09-complete.png` |
| T10 | CP-02 | انتقال + پیگیری مستقل + سابقه | پیگیری با parentId + اصلی در سوابق | 🟢 PASS | follow=true linked=1 | `docs/evidence/browser/10-transfer.png` |
| T11 | CP-02+ | فعال‌سازی آسان یادآوری (یک لمس) | اعلان آزمایشی واقعی + حالت فعال دکمه + ذخیرهٔ انتخاب | 🟢 PASS | fired=1 perm=granted saved=1 | `docs/evidence/browser/11-notify.png` |

**نتیجه: 11/11 سبز** — باتری E2E کاملاً سبز است.
