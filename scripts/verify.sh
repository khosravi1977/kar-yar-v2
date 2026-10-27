#!/usr/bin/env bash
# معادل make verify — سریِ سریع گاردها. قرمز = توقف.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== 1/3 unit+contract (node:test)"
# glob به‌جای دایرکتوری: سازگار با ویندوز/لینوکس
node --test "tests/*.test.mjs"
echo "== 2/3 guards + self-tests"
node scripts/ci/check-all.mjs
echo "== 3/3 smoke-fast"
node scripts/ci/smoke-fast.mjs
echo "VERIFY: GREEN ✅"
