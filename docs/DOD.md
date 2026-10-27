# تعریف انجام‌شده (DoD) — MASTER-TEST-FIREWALL PART C+D — کار یار ۴.۰

این سند «تمام‌شده» را عملیاتی می‌کند: هیچ آیتمی انتشار نیست مگر همهٔ گیت‌های زیر سبز باشند
و شواهدشان در `docs/evidence/` ثبت شده باشد. قرمز = توقف؛ سبزسازی مصنوعی ممنوع (گارد R3 خودش این سند و CI را می‌پاید).

## گیت‌های انتشار (همه اجباری)

| # | گیت | ابزار | معیار | شواهد |
|---|---|---|---|---|
| G1 | تست واحد + قرارداد | `node --test "tests/*.test.mjs"` | ≥ کف دفتر L7 (۵ فایل / ۴۰ تست) — فعلاً ۴۱ سبز | خروجی verify |
| G2 | گاردهای کیفیت (L6) | `scripts/ci/check-all.mjs` | ۸/۸ گارد سبز + self-test تک‌تک (R2) | خروجی check-all |
| G3 | اسموک سریع (L4) | `scripts/ci/smoke-fast.mjs` | shell کامل روی HTTP + DOM بحرانی + بودجهٔ حجم ≤ ۳ دقیقه | خروجی smoke |
| G4 | باتری E2E مرورگر واقعی | `node scripts/e2e/battery.mjs` (pre-release/دستی طبق TEST-MATRIX ردیف ۴) | ۷/۷ سناریو CP-01…CP-06 سبز + اسکرین‌شات | `docs/evidence/browser-battery.md` + `docs/evidence/browser/*.png` |
| G5 | تزریق قرمز (PART C) | `node scripts/red-injection.mjs` | هر ۸ حمله قرمز شود (فایروال اثبات شود) | `docs/evidence/red-injection.md` |
| G6 | دفتر کیفیت (L7) | `quality-baseline.d/*.json` | append-only؛ آخرین entry ملاک؛ کف/سقف فقط سخت‌تر | آخرین ورود |
| G7 | CI مخزن (L9) | `.github/workflows/ci.yml` (اکشن‌های SHA-pinned، بدون continue-on-error) | ران سبز روی GitHub برای commit انتشار | صفحهٔ Actions |
| G8 | دروازهٔ محلی | `bash scripts/verify.sh` | GREEN پایان‌پذیر؛ هیچ‌وقت با `\|\| true` سبز نشود | خروجی ترمینال |

## قواعد سخت انتشار
1. هر تغییر در فایل‌های shell (index.html/sw.js/manifest/fonts/icons) ⇒ bump اجباری `CACHE_NAME` در sw.js (Trap-02).
2. push فقط پس از G8 سبز؛ سپس G7 باید روی GitHub سبز شود — قرمزی CI = برگشت فوری.
3. هیچ وابستگی npm جدید (runtime یا dev) بدون توجیه کتبی — باتری E2E عمداً CDP خام است.
4. هر باگ‌فیکس با تست ابطال‌پذیر می‌آید که پیش از فیکس قرمز بوده (falsification).
5. متن کاربر فقط از رشته‌های موجود در index.html؛ لاگ هرگز توکن/محتوای خصوصی ذخیره نمی‌کند.

## فرمان‌های استاندارد
```
bash scripts/verify.sh              # G1+G2+G3+G8 (پیش از هر push — اجباری)
node scripts/e2e/battery.mjs        # G4 (pre-release / پس از هر تغییر ذخیره‌سازی)
node scripts/red-injection.mjs      # G5 (pre-release / پس از هر تغییر گاردها یا CI)
```
