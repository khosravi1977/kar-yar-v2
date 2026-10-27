# TEST-MATRIX — کار یار ۴.۰ (Master Test Firewall L1)
هر باگ باید دقیقاً یک لایهٔ آزمون داشته باشد؛ این ماتریس منجمد است و تغییرش نیازمند یادداشت در دفتر L7 است.

| # | سطح | ابزار | دامنه | بودجه | اجرا |
|---|---|---|---|---|---|
| 1 | Unit (منطق خالص) | `node --test` (رانر داخلی، صفر وابستگی) | js/idb, repository, migration, quota, logger | p95 ≤ 10s/فایل | هر push/PR |
| 2 | Contract (قرارداد داده) | تست‌های bulkUpsert/backup در node:test | قراردادهای repository/migration | ≤ 15s | هر push/PR |
| 3 | Smoke-fast (بوت محصول) | `scripts/ci/smoke-fast.mjs` (سرور واقعی + HTTP + DOM بحرانی + gzip) | CP-07/CP-08 + عناصر DOM بحرانی | ≤ 3min | هر push/PR |
| 4 | E2E مرورگر واقعی (hermetic محلی) | اسکریپت‌های رویداد واقعی DOM در مرورگر + شواهد متنی | CP-01…CP-06 | ≤ 15min | pre-release / دستی + پس از هر تغییر ذخیره‌سازی |
| 5 | E2E full (لینک عمومی) | مرورگر واقعی روی GitHub Pages | نصب‌پذیری، SW، آفلاین | ≤ 15min | pre-release |
| 6 | گاردهای کیفیت (ratchet) | `scripts/ci/check-*.mjs` با `--self-test` | precache, manifest, storage-contract, purity, forbidden, size, test-floor, CI-contract | هر گارد ≤ 10s | هر push/PR |
| 7 | A11y / Perf (Lighthouse) | ابزار خارجی | — | — | **در این محیط اجرا نمی‌شود — ثبت در ledger به‌عنوان gap فعال** |
| 8 | Visual | اسکرین‌شات مرورگر (شواهد دستی) | صفحهٔ اصلی موبایل | — | pre-release |

## قواعد
- هر تسک باگ‌فیکس با تستی می‌آید که پیش از فیکس قرمز بوده (falsification).
- فایل ماژول بدون فایل تست = قرمز (check-test-floor؛ allowlist فقط در ledger).
- تستِ skip شدنش = کم شدن از کفِ شمارش = قرمز (Trap D.2-2).
- زمان وابسته ممنوع: تست‌ها از `new Date()` تزریق‌شده استفاده می‌کنند نه ساعت واقعی در assertion.
