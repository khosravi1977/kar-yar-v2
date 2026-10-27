# شواهد تزریق قرمز (PART C) — 2026-10-27T21:46:48.566Z

| # | حمله | گارد پاسخگو | وضعیت | خروجی |
|---|---|---|---|---|
| 1 | حذف دکمهٔ ناوبری بحرانی | smoke-fast.mjs | 🔴 RED | GUARD RED (regression) / smoke: فایل shell روی HTTP نمی‌آید: fonts/Vazirmatn-Regular.woff2 |
| 2 | نفوذ DOM به لایهٔ داده (import مرزی) | check-js-purity.mjs | 🔴 RED | GUARD RED (regression) / نفوذ DOM به لایهٔ داده: repository.js → document. / repository.js → querySelector |
| 3 | عملیات مخرب داده (deleteDatabase در مهاجرت) | check-storage-contract.mjs | 🔴 RED | GUARD RED (regression) / deleteDatabase در migration.js ممنوع است (ریسک از دست رفتن داده) |
| 4 | حذف یک گارد از CI | check-ci-contract.mjs | 🔴 RED | GUARD RED (regression) / R1 نقض: گاردهای بدون CI: check-size.mjs |
| 5 | سبزسازی مصنوعی (continue-on-error) | check-ci-contract.mjs | 🔴 RED | GUARD RED (regression) / R3 نقض: continue-on-error در ci.yml |
| 6 | دستکاری خروجی تولیدی (فایل precache) | check-sw-precache.mjs | 🔴 RED | GUARD RED (regression) / فایل‌های precache ناموجود: ./icons/icon-512.png |
| 7 | || true برای پنهان کردن شکست | check-ci-contract.mjs | 🔴 RED | GUARD RED (regression) / R3 نقض: // true در ci.yml |
| 8 | حذف خاموش یک فایل تست | check-test-floor.mjs | 🔴 RED | GUARD RED (regression) / ماژول بدون تست: quota.js |

**نتیجه: هر ۸ حمله قرمز شدند — فایروال اثبات شد.**
